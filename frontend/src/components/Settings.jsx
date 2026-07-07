import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Save, CheckCircle, Trash2, UserPlus, Shield, Lock, Key, Bell, Server, Globe as GlobeIcon, Play, Square } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const GlobalSettings = ({ token }) => {
    const [settings, setSettings] = useState({
        slack_webhook_url: '',
        email_protocol: 'imap',
        email_mailbox: 'inbox',
        email_only_unread: true,
        email_delete_after_fetch: false,
        email_monitor_enabled: false,
        email_check_interval_minutes: 60,
        imap_host: '',
        imap_port: 993,
        imap_user: '',
        imap_pass: '',
        imap_use_ssl: true
    });
    const [monitorStatus, setMonitorStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [msg, setMsg] = useState(null);

    const fetchMonitorStatus = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/email-monitor`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setMonitorStatus(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/settings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSettings(data);
                }
            } catch (err) { console.error(err); }
            setLoading(false);
        };
        fetchSettings();
        fetchMonitorStatus();
    }, [token]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                setMsg({ type: 'success', text: 'Global settings saved!' });
                fetchMonitorStatus();
            } else {
                const data = await res.json();
                setMsg({ type: 'error', text: data.detail || 'Failed to save settings' });
            }
        } catch (err) { setMsg({ type: 'error', text: 'Failed to save settings' }); }
        setSaving(false);
    };

    const handleRunNow = async () => {
        setRunningNow(true);
        setMsg(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/email-monitor/run`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) setMsg({ type: 'success', text: data.message });
            else setMsg({ type: 'error', text: data.detail || 'Email fetch failed' });
            fetchMonitorStatus();
        } catch (err) {
            setMsg({ type: 'error', text: 'Email fetch failed' });
        }
        setRunningNow(false);
    };

    const handleMonitorToggle = async (enabled) => {
        const endpoint = enabled ? 'start' : 'stop';
        setMsg(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/email-monitor/${endpoint}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setSettings({ ...settings, email_monitor_enabled: enabled });
                setMonitorStatus(data);
                setMsg({ type: 'success', text: enabled ? 'Email monitor started.' : 'Email monitor stopped.' });
            } else {
                setMsg({ type: 'error', text: data.detail || 'Failed to update monitor' });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to update monitor' });
        }
    };

    if (loading) return null;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
            <div className="card">
                <div className="card-header">
                    <h3>Notification Settings</h3>
                </div>
                <div className="chart-wrapper" style={{ height: 'auto', padding: '1.5rem 2.5rem' }}>
                    <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                        Configure alerts for high failure rates. Alerts are triggered when a report shows &gt;25% failure (min 10 emails).
                    </p>
                    <div className="form-row">
                        <label className="form-label">Slack Webhook URL</label>
                        <div className="input-container">
                            <Bell size={16} className="input-icon" />
                            <input
                                type="url"
                                value={settings.slack_webhook_url}
                                onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
                                placeholder="https://hooks.slack.com/services/..."
                                className="input-with-icon"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>Email Monitoring</h3>
                </div>
                <div className="chart-wrapper" style={{ height: 'auto', padding: '1.5rem 2.5rem' }}>
                    <div className="form-row">
                        <label className="form-label">Protocol</label>
                        <select
                            value={settings.email_protocol}
                            onChange={(e) => {
                                const protocol = e.target.value;
                                setSettings({
                                    ...settings,
                                    email_protocol: protocol,
                                    imap_port: protocol === 'pop3' ? (settings.imap_use_ssl ? 995 : 110) : (settings.imap_use_ssl ? 993 : 143)
                                });
                            }}
                            className="input-with-icon"
                        >
                            <option value="imap">IMAP</option>
                            <option value="pop3">POP3</option>
                        </select>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Mail Server</label>
                        <div className="input-container">
                            <GlobeIcon size={16} className="input-icon" />
                            <input
                                type="text"
                                value={settings.imap_host}
                                onChange={(e) => setSettings({ ...settings, imap_host: e.target.value })}
                                placeholder="imap.gmail.com"
                                className="input-with-icon"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Port</label>
                        <input
                            type="number"
                            min="1"
                            max="65535"
                            value={settings.imap_port}
                            onChange={(e) => setSettings({ ...settings, imap_port: Number(e.target.value) })}
                            className="input-with-icon"
                        />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Username</label>
                        <div className="input-container">
                            <Mail size={16} className="input-icon" />
                            <input
                                type="text"
                                value={settings.imap_user}
                                onChange={(e) => setSettings({ ...settings, imap_user: e.target.value })}
                                placeholder="dmarc@example.com"
                                className="input-with-icon"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Password</label>
                        <div className="input-container">
                            <Lock size={16} className="input-icon" />
                            <input
                                type="password"
                                value={settings.imap_pass}
                                onChange={(e) => setSettings({ ...settings, imap_pass: e.target.value })}
                                placeholder="••••••••"
                                className="input-with-icon"
                            />
                        </div>
                    </div>
                    {settings.email_protocol === 'imap' && (
                        <div className="form-row">
                            <label className="form-label">Mailbox</label>
                            <input
                                type="text"
                                value={settings.email_mailbox}
                                onChange={(e) => setSettings({ ...settings, email_mailbox: e.target.value })}
                                placeholder="inbox"
                                className="input-with-icon"
                            />
                        </div>
                    )}
                    <div className="form-row">
                        <label className="form-label">Check Interval</label>
                        <input
                            type="number"
                            min="1"
                            value={settings.email_check_interval_minutes}
                            onChange={(e) => setSettings({ ...settings, email_check_interval_minutes: Number(e.target.value) })}
                            className="input-with-icon"
                        />
                    </div>
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={settings.imap_use_ssl}
                            onChange={(e) => {
                                const useSsl = e.target.checked;
                                setSettings({
                                    ...settings,
                                    imap_use_ssl: useSsl,
                                    imap_port: settings.email_protocol === 'pop3' ? (useSsl ? 995 : 110) : (useSsl ? 993 : 143)
                                });
                            }}
                        />
                        Use SSL/TLS
                    </label>
                    {settings.email_protocol === 'imap' && (
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={settings.email_only_unread}
                                onChange={(e) => setSettings({ ...settings, email_only_unread: e.target.checked })}
                            />
                            Only check unread messages
                        </label>
                    )}
                    {settings.email_protocol === 'pop3' && (
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={settings.email_delete_after_fetch}
                                onChange={(e) => setSettings({ ...settings, email_delete_after_fetch: e.target.checked })}
                            />
                            Delete POP3 messages after downloading reports
                        </label>
                    )}
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={settings.email_monitor_enabled}
                            onChange={(e) => setSettings({ ...settings, email_monitor_enabled: e.target.checked })}
                        />
                        Run email monitor automatically
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" type="button" onClick={handleRunNow} disabled={runningNow}>
                            <Play size={16} style={{ marginRight: '0.5rem' }} />
                            {runningNow ? 'Checking...' : 'Run Now'}
                        </button>
                        {monitorStatus?.running ? (
                            <button className="btn-secondary" type="button" onClick={() => handleMonitorToggle(false)}>
                                <Square size={16} style={{ marginRight: '0.5rem' }} />
                                Stop Monitor
                            </button>
                        ) : (
                            <button className="btn-secondary" type="button" onClick={() => handleMonitorToggle(true)}>
                                <Server size={16} style={{ marginRight: '0.5rem' }} />
                                Start Monitor
                            </button>
                        )}
                    </div>
                    {monitorStatus && (
                        <p className="text-muted" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                            Status: {monitorStatus.running ? 'running' : 'stopped'}
                            {monitorStatus.last_run_at ? ` • Last run: ${new Date(monitorStatus.last_run_at).toLocaleString()}` : ''}
                            {monitorStatus.next_run_at ? ` • Next run: ${new Date(monitorStatus.next_run_at).toLocaleString()}` : ''}
                        </p>
                    )}
                </div>
            </div>

            <div className="card" style={{ gridColumn: 'span 2' }}>
                <div style={{ padding: '1.5rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        {msg && <span className={`text-${msg.type === 'success' ? 'success' : 'danger'}`} style={{ fontSize: '0.875rem' }}>{msg.text}</span>}
                    </div>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>
                        <Save size={18} style={{ marginRight: '0.5rem' }} />
                        {saving ? 'Saving...' : 'Save Global Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const UserManagement = ({ token }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newUser, setNewUser] = useState({ username: '', password: '', first_name: '', last_name: '', email: '', role: 'user' });
    const [editingUser, setEditingUser] = useState(null);
    const [viewingKeysFor, setViewingKeysFor] = useState(null); // { id, username }
    const [msg, setMsg] = useState(null);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setUsers(await res.json());
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(newUser)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'User created!' });
                setNewUser({ username: '', password: '', first_name: '', last_name: '', email: '', role: 'user' });
                fetchUsers();
            } else {
                const errorText = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
                setMsg({ type: 'error', text: errorText || 'Failed to create user' });
            }
        } catch (err) { setMsg({ type: 'error', text: 'Failed to create user' }); }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${editingUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(editingUser)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: 'User updated!' });
                setEditingUser(null);
                fetchUsers();
            } else {
                const errorText = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
                setMsg({ type: 'error', text: errorText || 'Failed to update user' });
            }
        } catch (err) { setMsg({ type: 'error', text: 'Failed to update user' }); }
    };

    const startEdit = (u) => {
        setEditingUser({ ...u, password: '' });
        setMsg(null);
        // Scroll to form
        const form = document.getElementById('user-form');
        if (form) form.scrollIntoView({ behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this user?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchUsers();
            else {
                const data = await res.json();
                alert(data.detail || 'Failed to delete');
            }
        } catch (err) { console.error(err); }
    };

    return (
        <div className="card settings-container" style={{ marginTop: '2rem' }}>
            <div className="card-header">
                <h3>User Management</h3>
            </div>
            <div className="chart-wrapper" style={{ height: 'auto', padding: '2.5rem' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ marginBottom: '1rem' }}>Existing Users</h4>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Email</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td>{u.first_name} {u.last_name}</td>
                                    <td>{u.username}</td>
                                    <td><span className={`status-badge ${u.role === 'admin' ? 'pass' : 'text-muted'}`} style={{ padding: '2px 8px' }}>{u.role}</span></td>
                                    <td className="text-muted">{u.email}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => setViewingKeysFor({ id: u.id, username: u.username })} className="btn-text" title="Manage API Keys">
                                                <Key size={16} />
                                            </button>
                                            <button onClick={() => startEdit(u)} className="btn-text" style={{ color: 'var(--primary-color)' }}>
                                                Edit
                                            </button>
                                            <button onClick={() => handleDelete(u.id)} className="btn-text" style={{ color: 'var(--danger)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {viewingKeysFor && (
                    <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '2rem', paddingTop: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h4>API Keys for {viewingKeysFor.username}</h4>
                            <button onClick={() => setViewingKeysFor(null)} className="btn-text">Close Keys</button>
                        </div>
                        <ApiKeyManagement token={token} userId={viewingKeysFor.id} userName={viewingKeysFor.username} />
                    </div>
                )}

                <div id="user-form" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h4>{editingUser ? `Edit User: ${editingUser.username}` : 'Add New User'}</h4>
                        {editingUser && (
                            <button onClick={() => setEditingUser(null)} className="btn-text">Cancel Edit</button>
                        )}
                    </div>
                    {msg && (
                        <div className={`status-badge ${msg.type === 'success' ? 'pass' : 'fail'}`} style={{ width: '100%', marginBottom: '1.5rem', padding: '0.75rem', justifyContent: 'center', boxSizing: 'border-box' }}>
                            {msg.text}
                        </div>
                    )}
                    <form onSubmit={editingUser ? handleUpdate : handleCreate} className="settings-form">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Username</label>
                                <div className="input-container">
                                    <User size={16} className="input-icon" />
                                    <input
                                        type="text"
                                        className="input-with-icon"
                                        placeholder="username"
                                        value={editingUser ? editingUser.username : newUser.username}
                                        onChange={e => editingUser ? setEditingUser({ ...editingUser, username: e.target.value }) : setNewUser({ ...newUser, username: e.target.value })}
                                        required
                                        disabled={!!editingUser}
                                        style={editingUser ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">{editingUser ? 'New Password (optional)' : 'Password'}</label>
                                <div className="input-container">
                                    <Lock size={16} className="input-icon" />
                                    <input
                                        type="password"
                                        className="input-with-icon"
                                        placeholder={editingUser ? "Leave blank to keep current" : "password"}
                                        value={editingUser ? editingUser.password : newUser.password}
                                        onChange={e => editingUser ? setEditingUser({ ...editingUser, password: e.target.value }) : setNewUser({ ...newUser, password: e.target.value })}
                                        required={!editingUser}
                                    />
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">First Name</label>
                                <input
                                    type="text"
                                    className="input-with-icon"
                                    style={{ paddingLeft: '1rem' }}
                                    placeholder="First Name"
                                    value={editingUser ? editingUser.first_name : newUser.first_name}
                                    onChange={e => editingUser ? setEditingUser({ ...editingUser, first_name: e.target.value }) : setNewUser({ ...newUser, first_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Last Name</label>
                                <input
                                    type="text"
                                    className="input-with-icon"
                                    style={{ paddingLeft: '1rem' }}
                                    placeholder="Last Name"
                                    value={editingUser ? editingUser.last_name : newUser.last_name}
                                    onChange={e => editingUser ? setEditingUser({ ...editingUser, last_name: e.target.value }) : setNewUser({ ...newUser, last_name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Email Address</label>
                            <div className="input-container">
                                <Mail size={16} className="input-icon" />
                                <input
                                    type="email"
                                    className="input-with-icon"
                                    placeholder="email@example.com"
                                    value={editingUser ? editingUser.email : newUser.email}
                                    onChange={e => editingUser ? setEditingUser({ ...editingUser, email: e.target.value }) : setNewUser({ ...newUser, email: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Role</label>
                            <select
                                className="input-with-icon"
                                style={{ paddingLeft: '1rem' }}
                                value={editingUser ? editingUser.role : newUser.role}
                                onChange={e => editingUser ? setEditingUser({ ...editingUser, role: e.target.value }) : setNewUser({ ...newUser, role: e.target.value })}
                            >
                                <option value="user">Normal User</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn-primary">
                                {editingUser ? (
                                    <>
                                        <Save size={18} style={{ marginRight: '0.5rem' }} />
                                        Update User
                                    </>
                                ) : (
                                    <>
                                        <UserPlus size={18} style={{ marginRight: '0.5rem' }} />
                                        Create User
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

const ApiKeyManagement = ({ token, userId = null, userName = null }) => {
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState('');
    const [createdKey, setCreatedKey] = useState(null);
    const [error, setError] = useState(null);

    const fetchKeys = async () => {
        try {
            const url = userId
                ? `${API_BASE_URL}/api/users/${userId}/api-keys`
                : `${API_BASE_URL}/api/user/api-keys`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setKeys(await res.json());
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { fetchKeys(); }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        setError(null);
        setCreatedKey(null);
        try {
            // Admin generating key for another user is NOT currently supported by backend
            // unless we use a different endpoint. Backend's POST /api/user/api-keys uses current_user.
            // Let's check if there is an admin POST endpoint.
            // Backend only has GET /api/users/{user_id}/api-keys and DELETE ...
            // So if userId is present and not same as current user, we should disable creation?
            // Actually, let's just use the current user's endpoint if no userId provided.
            if (userId) {
                setError("Admin creation of keys for other users is not yet implemented in backend.");
                return;
            }

            const res = await fetch(`${API_BASE_URL}/api/user/api-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: newKeyName })
            });
            const data = await res.json();
            if (res.ok) {
                setCreatedKey(data.key);
                setNewKeyName('');
                fetchKeys();
            } else {
                setError(data.detail || 'Failed to create key');
            }
        } catch (err) { setError('Failed to create key'); }
    };

    const handleRevoke = async (id) => {
        if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
        try {
            const url = userId
                ? `${API_BASE_URL}/api/users/${userId}/api-keys/${id}`
                : `${API_BASE_URL}/api/user/api-keys/${id}`;
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchKeys();
        } catch (err) { console.error(err); }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    return (
        <div className="card settings-container" style={{ marginTop: '2rem' }}>
            <div className="card-header">
                <h3>API Keys</h3>
            </div>
            <div className="chart-wrapper" style={{ height: 'auto', padding: '2.5rem' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                    Use API keys to authenticate with the DMARC Report Manager from CLI tools or external scripts.
                </p>

                {createdKey && (
                    <div className="status-badge pass" style={{ width: '100%', marginBottom: '1.5rem', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', boxSizing: 'border-box', height: 'auto' }}>
                        <div style={{ fontWeight: 600 }}>Key Created! Copy it now, you won't see it again:</div>
                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                            <input type="text" className="input-with-icon" style={{ paddingLeft: '1rem', flex: 1, fontFamily: 'monospace' }} value={createdKey} readOnly onClick={(e) => e.target.select()} />
                            <button className="btn-primary" onClick={() => copyToClipboard(createdKey)}>Copy</button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="status-badge fail" style={{ width: '100%', marginBottom: '1.5rem', padding: '0.75rem', justifyContent: 'center', boxSizing: 'border-box' }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: '2rem' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Created</th>
                                <th>Last Used</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No API keys found.</td>
                                </tr>
                            )}
                            {keys.map(k => (
                                <tr key={k.id}>
                                    <td className="font-medium">{k.name}</td>
                                    <td className="text-muted">{new Date(k.created_at).toLocaleDateString()}</td>
                                    <td className="text-muted">{k.last_used_at ? new Date(k.last_used_at + "Z").toLocaleDateString() : 'Never'}</td>
                                    <td>
                                        <button onClick={() => handleRevoke(k.id)} className="btn-text" style={{ color: 'var(--danger)' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!userId && (
                    <form onSubmit={handleCreate} className="settings-form" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                        <div className="form-row">
                            <label className="form-label">New API Key Label</label>
                            <div className="input-container">
                                <input type="text" className="input-with-icon" style={{ paddingLeft: '1rem' }} placeholder="e.g. CLI Tool, Monitoring Script" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} required />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button type="submit" className="btn-primary">Generate API Key</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};


const Settings = () => {
    const { user, isAdmin, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        password: '' // Optional password update
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        if (!authLoading && !user) {
            navigate('/login');
            return;
        }

        const fetchProfile = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (!res.ok) throw new Error("Failed to fetch profile");
                const data = await res.json();
                setProfile({ ...data, password: '' });
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        };

        if (user) fetchProfile();
    }, [user, authLoading]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
                body: JSON.stringify(profile)
            });
            if (!res.ok) {
                const data = await res.json();
                const errorText = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
                throw new Error(errorText || "Failed to update profile");
            }
            setMessage({ type: 'success', text: 'Profile updated successfully!' });

            // Dispatch a custom event to notify Layout to refresh the profile
            window.dispatchEvent(new Event('profileUpdated'));
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        }
        setSaving(false);
    };

    if (authLoading || (loading && user)) return <div className="dashboard-content"><h1>Settings</h1><p>Loading profile...</p></div>;
    if (!user) return null;

    return (
        <div className="dashboard-content">
            <header className="content-header">
                <div>
                    <h1>Settings</h1>
                    <p>Manage your personal information and preferences</p>
                </div>
            </header>

            <div className="card settings-container">
                <div className="card-header">
                    <h3>Your Profile</h3>
                </div>
                <div className="chart-wrapper" style={{ height: 'auto', padding: '2.5rem' }}>
                    {message && (
                        <div className={`status-badge ${message.type === 'success' ? 'pass' : 'fail'}`} style={{ width: '100%', marginBottom: '2rem', padding: '0.75rem', justifyContent: 'center', boxSizing: 'border-box' }}>
                            {message.type === 'success' && <CheckCircle size={16} style={{ marginRight: '0.5rem' }} />}
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="settings-form">
                        <div className="form-row">
                            <label className="form-label">Username</label>
                            <div className="input-container">
                                <Shield size={16} className="input-icon" />
                                <input type="text" className="input-with-icon" value={user.username} disabled style={{ background: '#f8fafc', cursor: 'not-allowed' }} />
                            </div>
                        </div>

                        <div className="form-row">
                            <label className="form-label">First Name</label>
                            <div className="input-container">
                                <User size={16} className="input-icon" />
                                <input type="text" name="first_name" value={profile.first_name} onChange={handleChange} placeholder="First Name" className="input-with-icon" required />
                            </div>
                        </div>

                        <div className="form-row">
                            <label className="form-label">Last Name</label>
                            <div className="input-container">
                                <User size={16} className="input-icon" />
                                <input type="text" name="last_name" value={profile.last_name} onChange={handleChange} placeholder="Last Name" className="input-with-icon" required />
                            </div>
                        </div>

                        <div className="form-row">
                            <label className="form-label">Email Address</label>
                            <div className="input-container">
                                <Mail size={16} className="input-icon" />
                                <input type="email" name="email" value={profile.email} onChange={handleChange} placeholder="Email Address" className="input-with-icon" required />
                            </div>
                        </div>

                        <div className="form-row">
                            <label className="form-label">Phone Number</label>
                            <div className="input-container">
                                <Phone size={16} className="input-icon" />
                                <input type="tel" name="phone" value={profile.phone} onChange={handleChange} placeholder="Phone Number" className="input-with-icon" />
                            </div>
                        </div>

                        <div className="form-row">
                            <label className="form-label">Change Password</label>
                            <div className="input-container">
                                <Lock size={16} className="input-icon" />
                                <input type="password" name="password" value={profile.password} onChange={handleChange} placeholder="Leave blank to keep current" className="input-with-icon" />
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                            <button type="submit" className="btn-primary" disabled={saving} style={{ minWidth: '140px' }}>
                                <Save size={18} style={{ marginRight: '0.5rem' }} />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <ApiKeyManagement token={user.token} />

            {isAdmin && <GlobalSettings token={user.token} />}

            {isAdmin && <UserManagement token={user.token} />}

        </div>
    );
};

export default Settings;
