from typing import Optional
import math

def get_paginated_response(query_or_list, page: Optional[int], page_size: int, serializer_func, is_query=True):
    if page is None:
        items = query_or_list.all() if is_query else query_or_list
        return [serializer_func(x) for x in items]
    
    if is_query:
        total = query_or_list.count()
        offset = (page - 1) * page_size
        items = query_or_list.offset(offset).limit(page_size).all()
    else:
        total = len(query_or_list)
        offset = (page - 1) * page_size
        items = query_or_list[offset:offset + page_size]
        
    pages = math.ceil(total / page_size) if page_size > 0 else 1
    return {
        "items": [serializer_func(x) for x in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages
    }
