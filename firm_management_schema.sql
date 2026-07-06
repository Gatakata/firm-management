-- VCCA Firm Management Platform PostgreSQL Schema

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'User',
  status VARCHAR(10) DEFAULT 'Active',
  must_reset BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_users_role CHECK (role IN ('Administrator', 'User')),
  CONSTRAINT chk_users_status CHECK (status IN ('Active', 'Disabled'))
);

CREATE TABLE prospects (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(30),
  email VARCHAR(100),
  service_required VARCHAR(100),
  lead_source VARCHAR(80),
  marketing_status VARCHAR(50) DEFAULT 'New',
  quotation_status VARCHAR(30) DEFAULT 'None',
  notes TEXT,
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE quotations (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
  quotation_ref VARCHAR(50) UNIQUE NOT NULL,
  service_description TEXT,
  amount NUMERIC(12,2),
  currency VARCHAR(30) NOT NULL DEFAULT 'USD',
  sent_date DATE,
  status VARCHAR(20) DEFAULT 'Pending',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_quote_status CHECK (status IN ('Pending', 'Accepted', 'Rejected')),
  CONSTRAINT chk_quote_currency CHECK (currency IN ('USD', 'SCR', 'Euro'))
);

CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER REFERENCES prospects(id),
  quotation_id INTEGER REFERENCES quotations(id),
  company_name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(30),
  email VARCHAR(100),
  service_type VARCHAR(100),
  engagement_letter_status VARCHAR(30) DEFAULT 'Outstanding',
  engagement_letter_date DATE,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_engagement_status CHECK (engagement_letter_status IN ('Outstanding', 'Issued', 'Signed'))
);

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  service_type VARCHAR(80) NOT NULL,
  description TEXT,
  start_date DATE,
  expected_completion DATE,
  actual_completion DATE,
  status VARCHAR(30) DEFAULT 'Not Started',
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_project_status CHECK (status IN ('Not Started', 'In Progress', 'Under Review', 'Completed'))
);

CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id),
  invoice_ref VARCHAR(50) UNIQUE NOT NULL,
  currency VARCHAR(30) NOT NULL DEFAULT 'USD',
  amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'Unpaid',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_invoice_amounts CHECK (amount >= 0 AND amount_paid >= 0),
  CONSTRAINT chk_invoice_currency CHECK (currency IN ('USD', 'SCR', 'Euro')),
  CONSTRAINT chk_payment_status CHECK (payment_status IN ('Paid', 'Partially Paid', 'Unpaid', 'Overdue'))
);

CREATE TABLE compliance (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  tax_type VARCHAR(80) NOT NULL,
  tax_period VARCHAR(50),
  filing_deadline DATE,
  filing_date DATE,
  status VARCHAR(30) DEFAULT 'Pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_compliance_status CHECK (status IN ('Pending', 'Submitted', 'Acknowledged'))
);

CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100),
  entity_type VARCHAR(50),
  entity_id INTEGER,
  detail TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_prospects_marketing_status ON prospects(marketing_status);
CREATE INDEX idx_prospects_service_required ON prospects(service_required);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_clients_engagement_status ON clients(engagement_letter_status);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_expected_completion ON projects(expected_completion);
CREATE INDEX idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_compliance_status ON compliance(status);
CREATE INDEX idx_compliance_filing_deadline ON compliance(filing_deadline);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);
