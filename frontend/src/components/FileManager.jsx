import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, FileText, Upload, RefreshCw, AlertTriangle, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import ImportModal from './ImportModal';
import FlushReportsModal from './FlushReportsModal';

const FileManager = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isFlushOpen, setIsFlushOpen] = useState(false);

    const fetchFiles = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/files`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });

            if (!res.ok) throw new Error("Failed to fetch files");
            const data = await res.json();
            setFiles(data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!authLoading && !user) navigate('/login');
        if (user) fetchFiles();
    }, [user, authLoading]);


    const handleDelete = async (filename) => {
        if (!confirm(`Delete ${filename}?`)) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/files/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${user.token}` }
            });

            if (res.ok) {
                fetchFiles();
            }
        } catch (err) {
            alert("Failed to delete file");
        }
    };

    const [fetchingEmail, setFetchingEmail] = useState(false);

    const handleFetchEmail = async () => {
        if (!user) return;
        setFetchingEmail(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/fetch-email`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            const data = await res.json();
            alert(data.message || data.detail || "Email fetch completed");
            fetchFiles();
        } catch (err) {
            alert("Failed to fetch emails");
        }
        setFetchingEmail(false);
    };

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="dashboard-content">
            <header className="content-header">
                <div>
                    <h1>File Manager</h1>
                    <p>Manage uploaded DMARC report files</p>
                </div>
                <div className="header-actions">
                    <button className="btn-secondary" onClick={handleFetchEmail} disabled={fetchingEmail} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Mail size={18} />
                        {fetchingEmail ? 'Fetching...' : 'Fetch from Email'}
                    </button>
                    <button className="btn-secondary" onClick={fetchFiles}><RefreshCw size={18} /></button>
                    <button className="btn-danger-outline" onClick={() => setIsFlushOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Trash2 size={18} />
                        Flush Reports
                    </button>
                    <button className="btn-primary" onClick={() => setIsUploadOpen(true)}>
                        <Upload size={18} style={{ marginRight: '0.5rem' }} />
                        Upload
                    </button>
                </div>
            </header>


            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>File Name</th>
                            <th>Size</th>
                            <th>Uploaded At</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}>
                                    <td><div className="skeleton skeleton-text" style={{ width: '250px' }}></div></td>
                                    <td><div className="skeleton skeleton-text" style={{ width: '80px' }}></div></td>
                                    <td><div className="skeleton skeleton-text" style={{ width: '150px' }}></div></td>
                                    <td><div className="skeleton skeleton-text" style={{ width: '100px' }}></div></td>
                                    <td><div className="skeleton skeleton-text" style={{ width: '40px' }}></div></td>
                                </tr>
                            ))
                        ) : files.length === 0 ? (
                            <tr><td colSpan="5" className="text-center p-4">No files uploaded yet.</td></tr>
                        ) : (
                            files.map((file) => (
                                <tr key={file.name}>
                                    <td className="font-medium" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <FileText size={16} className="text-muted" />
                                        {file.name}
                                    </td>
                                    <td className="text-muted">{formatSize(file.size)}</td>
                                    <td className="text-muted">{new Date(file.created).toLocaleString()}</td>
                                    <td>
                                        <span className="status-badge pass">Processed</span>
                                    </td>
                                    <td>
                                        <button
                                            className="btn-icon-sm text-danger"
                                            title="Delete"
                                            onClick={() => handleDelete(file.name)}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <FlushReportsModal
                isOpen={isFlushOpen}
                onClose={() => setIsFlushOpen(false)}
                onFlushComplete={fetchFiles}
            />

            <ImportModal
                isOpen={isUploadOpen}
                onClose={() => setIsUploadOpen(false)}
                onUploadComplete={fetchFiles}
            />
        </div >
    );
};


export default FileManager;
