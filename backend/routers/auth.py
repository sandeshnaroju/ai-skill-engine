import os
import smtplib
import secrets
import datetime as dt
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, Tenant
from auth import hash_password, verify_password, get_current_user, generate_api_key

router = APIRouter()

# SMTP Configuration
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT_STR = os.environ.get("SMTP_PORT", "587")
SMTP_PORT = int(SMTP_PORT_STR) if SMTP_PORT_STR.isdigit() else 587
SMTP_USERNAME = os.environ.get("SMTP_USERNAME")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_SENDER = os.environ.get("SMTP_SENDER", SMTP_USERNAME)

def is_smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD)

def send_otp_email(to_email: str, otp: str):
    if not is_smtp_configured():
        return
    
    msg = MIMEMultipart()
    msg['From'] = SMTP_SENDER
    msg['To'] = to_email
    msg['Subject'] = "Verify Your Account - OTP Verification"
    
    body = f"""
    <div style="font-family: 'Inter', system-ui, sans-serif; background-color: #0a0f1d; color: #f8fafc; padding: 40px; border-radius: 16px; max-width: 500px; margin: auto; border: 1px solid rgba(255,255,255,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="font-size: 24px; font-weight: 800; margin: 0 0 6px 0; color: #ffffff;">Welcome to AI Skill Engine</h2>
            <p style="font-size: 14px; color: #94a3b8; margin: 0;">Please use the verification code below to verify your account.</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; text-align: center; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #8b5cf6;">{otp}</span>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">This code is valid for 15 minutes. If you did not register for an account, you can safely ignore this email.</p>
    </div>
    """
    
    msg.attach(MIMEText(body, 'html'))
    
    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_SENDER, to_email, msg.as_string())
        server.quit()
        print(f"DEBUG: Verification OTP email sent to {to_email}")
    except Exception as e:
        print(f"ERROR: Failed to send verification email to {to_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send verification email. Please contact support or check server settings.")

class UserRegister(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class ResendOtpRequest(BaseModel):
    email: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/register")
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        hashed = hash_password(payload.password)
        existing.hashed_password = hashed
        
        smtp_enabled = is_smtp_configured()
        if smtp_enabled:
            otp = "".join(secrets.choice("0123456789") for _ in range(6))
            existing.verification_otp = otp
            existing.verification_otp_expires = dt.datetime.utcnow() + dt.timedelta(minutes=15)
            db.commit()
            send_otp_email(existing.email, otp)
            return {"message": "User registered successfully. Please verify your email with the OTP sent.", "verification_required": True}
        else:
            existing.is_verified = True
            existing.verification_otp = None
            existing.verification_otp_expires = None
            db.commit()
            return {"message": "User registered successfully", "verification_required": False}
        
    hashed = hash_password(payload.password)
    user = User(email=email_clean, hashed_password=hashed)
    
    smtp_enabled = is_smtp_configured()
    if smtp_enabled:
        otp = "".join(secrets.choice("0123456789") for _ in range(6))
        user.is_verified = False
        user.verification_otp = otp
        user.verification_otp_expires = dt.datetime.utcnow() + dt.timedelta(minutes=15)
    else:
        user.is_verified = True
        user.verification_otp = None
        user.verification_otp_expires = None

    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Auto-create default tenant for the new user
    tenant = Tenant(
        name=f"Default Workspace",
        api_key=generate_api_key("sk_usr_"),
        is_active=True,
        user_id=user.id
    )
    db.add(tenant)
    db.commit()
    
    if smtp_enabled:
        send_otp_email(user.email, otp)
        return {"message": "User registered successfully. Please verify your email with the OTP sent.", "verification_required": True}
    
    return {"message": "User registered successfully", "verification_required": False}

@router.post("/login")
def login_user(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not user.is_verified:
        raise HTTPException(status_code=401, detail="Please verify your email address before logging in.")

    session_token = generate_api_key("session_")
    user.session_token = session_token
    db.commit()
    
    # Set secure HTTP-only cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        max_age=86400 * 30, # 30 days
        samesite="lax",
        secure=False # Set to True in production with HTTPS
    )
    return {"message": "Logged in successfully", "email": user.email}

@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified:
        return {"message": "User is already verified"}
        
    if not user.verification_otp or user.verification_otp != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    if user.verification_otp_expires and user.verification_otp_expires < dt.datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code has expired")
        
    user.is_verified = True
    user.verification_otp = None
    user.verification_otp_expires = None
    db.commit()
    return {"message": "Email verified successfully"}

@router.post("/resend-otp")
def resend_otp(payload: ResendOtpRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.is_verified:
        raise HTTPException(status_code=400, detail="User is already verified")
        
    if not is_smtp_configured():
        raise HTTPException(status_code=500, detail="Email service is not configured")
        
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    user.verification_otp = otp
    user.verification_otp_expires = dt.datetime.utcnow() + dt.timedelta(minutes=15)
    db.commit()
    
    send_otp_email(user.email, otp)
    return {"message": "Verification code resent"}

@router.post("/logout")
def logout_user(response: Response):
    response.delete_cookie("session_token")
    return {"message": "Logged out successfully"}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email
    }

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user:
        # Don't reveal if user exists
        return {"message": "If an account exists, a password reset link has been sent."}
        
    if not is_smtp_configured():
        raise HTTPException(status_code=500, detail="Email service is not configured")
        
    token = generate_api_key("reset_")
    user.reset_token = token
    user.reset_token_expires = dt.datetime.utcnow() + dt.timedelta(hours=1)
    db.commit()
    
    # Send email
    msg = MIMEMultipart()
    msg['From'] = SMTP_SENDER
    msg['To'] = user.email
    msg['Subject'] = "Password Reset Request"
    
    # Use front-end URL for the reset link
    # We should grab the origin from the request, but for now we'll use a placeholder or relative path
    # which the frontend should handle
    body = f"""
    <div style="font-family: sans-serif; padding: 20px;">
        <h2>Password Reset</h2>
        <p>You requested a password reset. Use this token to reset your password:</p>
        <div style="background: #f4f4f4; padding: 15px; margin: 20px 0; font-family: monospace; font-size: 16px;">
            {token}
        </div>
        <p>This token expires in 1 hour.</p>
        <p>If you didn't request this, ignore this email.</p>
    </div>
    """
    msg.attach(MIMEText(body, 'html'))
    
    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_SENDER, user.email, msg.as_string())
        server.quit()
    except Exception as e:
        print(f"ERROR: Failed to send reset email to {user.email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send reset email")
        
    return {"message": "If an account exists, a password reset link has been sent."}

@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
    user = db.query(User).filter(User.reset_token == payload.token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    if user.reset_token_expires and user.reset_token_expires < dt.datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset token has expired")
        
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    
    # Invalidate all current sessions
    user.session_token = None
    
    db.commit()
    return {"message": "Password reset successfully. You can now log in."}

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

