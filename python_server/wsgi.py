import sys
import os

# Set project directory in python sys.path for PythonAnywhere WSGI
project_home = '/home/mahabir/flipkart-review-search-pro/python_server'
if os.path.exists(project_home) and project_home not in sys.path:
    sys.path.insert(0, project_home)
else:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)

from app import app as application
