-- Audit Logs Table for Security and Compliance
-- This table stores comprehensive audit logs for all security-sensitive operations

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs" ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Service role can insert (for server-side logging)
CREATE POLICY "Service can insert audit logs" ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- No updates or deletes allowed (audit logs are immutable)
-- This ensures the integrity of the audit trail

-- Comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for security monitoring and compliance';
COMMENT ON COLUMN audit_logs.action IS 'Type of action performed (e.g., PASSWORD_CHANGED, WITHDRAWAL_CREATE)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., WITHDRAWAL, TRADE, STAKING)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional details about the action (sensitive data is sanitized)';
COMMENT ON COLUMN audit_logs.ip_address IS 'Client IP address for security tracking';
COMMENT ON COLUMN audit_logs.user_agent IS 'Client user agent for device identification';
COMMENT ON COLUMN audit_logs.status IS 'Outcome of the action: success, failure, or pending';
