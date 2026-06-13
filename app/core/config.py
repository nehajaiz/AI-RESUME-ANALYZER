"""
Settings facade for code that expects `app.core.config`.

The project in this workspace is flat-file, but the API modules and tests
import settings via `app.core.config`. This file bridges that import.
"""

from config import settings  # re-export

