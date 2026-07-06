VCCA Firm Management Platform

Stack
- Backend: Flask + SQLAlchemy
- Frontend: HTML5/CSS3/JavaScript SPA
- Database: PostgreSQL

Project Location
- vcca_firm

Setup
1. Create/use Python 3.10 virtual environment (required for psycopg2-binary 2.9.9 on Windows):
   py -3.10 -m venv .venv310
2. Install dependencies:
   .venv310\Scripts\python.exe -m pip install -r vcca_firm/requirements.txt
3. Run guided bootstrap (prompts for PostgreSQL credentials securely in terminal, writes .env, tests DB connection, creates tables, creates first Administrator):
   cd vcca_firm
   ..\.venv310\Scripts\python.exe bootstrap.py
4. Optional DB check:
   ..\.venv310\Scripts\python.exe -m flask --app app.py test-db
5. Run app:
   ..\.venv310\Scripts\python.exe app.py
6. Open:
   http://127.0.0.1:5000/login

Alternative manual DB setup
1. Create PostgreSQL database named vcca_firm.
2. Run schema in firm_management_schema.sql.
3. Copy vcca_firm/.env.example to vcca_firm/.env and set DATABASE_URL.

Security/Behavior Included
- Flask-Login session auth
- CSRF via Flask-WTF/CSRFProtect
- Password hashing via Werkzeug
- Password policy enforcement
- Admin-only users APIs via decorator
- Activity logging for create/update/delete/login actions
- 8-hour session lifetime

Notes
- Replace static logo placeholder at vcca_firm/static/img/vcca_logo.png with official VCCA logo.
- SPA is served by templates/app.html and powered by static/js/app.js.
- Do not share DB passwords in chat; enter them directly in terminal during bootstrap.

Free Public Deployment (No Paid Domain)
1. Push this project to a GitHub repository.
2. Create a free account on Render and click New + > Web Service.
3. Connect your GitHub repo and select this repository.
4. Use these Render settings:
   - Root Directory: vcca_firm
   - Build Command: pip install -r requirements.txt
   - Start Command: gunicorn wsgi:application
5. In Render, add a PostgreSQL database (free tier if available in your region) and copy its External Database URL.
6. In Web Service Environment Variables, add:
   - SECRET_KEY: generate a random long string
   - DATABASE_URL: paste Render Postgres External Database URL
7. Deploy. Your app will be available at a Render subdomain link (for example: https://your-app-name.onrender.com).

Important for free plans
- Free instances may sleep after inactivity and wake up on first request.
- You do not need to buy a domain; the Render subdomain is enough to share publicly.
