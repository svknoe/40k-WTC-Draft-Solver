__all__ = ['timing']

from functools import wraps
from time import time
from loguru import logger

def timing(f):
    """
        Python decorator declaration to log the time taken by a function to execute.\n
        Use @timing on top of a function to log the time taken by the function to execute.
    """
    @wraps(f)
    def wrap(*args, **kw):
        ts = time()
        result = f(*args, **kw)
        te = time()
        logger.info('func:%r args:[%r, %r] took: %2.4f sec' % \
          (f.__name__, args, kw, te-ts))
        return result
    return wrap