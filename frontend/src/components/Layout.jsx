import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, FileText, Globe, Settings, Shield,
    ChevronLeft, ChevronRight, Database, LogIn, LogOut,
    Sun, Moon, Menu, X, FileDown
} from 'lucide-react';
import Cookies from 'js-cookie';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';


const Layout = ({ children }) => {
    const location = useLocation();
    const { user, logout, isAdmin } = useAuth();


    // Initialize state from cookie, default to true (open) if not set
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const savedState = Cookies.get('sidebar_state');
        return savedState === undefined ? true : savedState === 'true';
    });

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const toggleSidebar = () => {
        const newState = !isSidebarOpen;
        setIsSidebarOpen(newState);
        Cookies.set('sidebar_state', newState, { expires: 365 });
    };

    const toggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isMobileMenuOpen]);

    const [version, setVersion] = useState('');
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = Cookies.get('theme');
        return saved === 'dark';
    });

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-theme');
            Cookies.set('theme', 'dark', { expires: 365 });
        } else {
            document.body.classList.remove('dark-theme');
            Cookies.set('theme', 'light', { expires: 365 });
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);


    useEffect(() => {
        fetch(`${API_BASE_URL}/api/version`)
            .then(res => res.json())
            .then(data => setVersion(data.version))
            .catch(err => console.error("Failed to fetch version", err));
    }, []);

    const isActive = (path) => {
        return location.pathname === path ? 'active' : '';
    };

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);


    const userInitials = user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() : '';
    const fullName = user ? `${user.first_name} ${user.last_name}` : '';

    const handleGlobalExport = async () => {
        if (!user) return;
        try {
            // Default to last 30 days for global export
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 30);

            const startTs = Math.floor(start.getTime() / 1000);
            const endTs = Math.floor(end.getTime() / 1000 + 86399);

            const res = await fetch(`${API_BASE_URL}/api/stats/pdf?start=${startTs}&end=${endTs}`, {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });

            if (!res.ok) throw new Error("Failed to generate PDF");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dmarc-summary-last30days.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error(err);
            alert("Export failed");
        }
    };

    return (
        <div className={`layout-container ${!isSidebarOpen ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            {/* Mobile Header */}
            <header className="mobile-header">
                <button onClick={toggleMobileMenu} className="btn-icon">
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
                <div className="mobile-logo">
                    <img src="/logo-icon.png" alt="DMARC Logo" style={{ width: '24px', height: '24px' }} />
                    <span className="logo-text">DMARC Mgr</span>
                </div>
                <div style={{ width: '24px' }}></div> {/* Spacer */}
            </header>

            {/* Backdrop for mobile */}
            {isMobileMenuOpen && <div className="sidebar-backdrop" onClick={toggleMobileMenu}></div>}

            <aside className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-visible' : ''}`}>
                <div className="sidebar-header">
                    <img src="/logo-icon.png" alt="DMARC Logo" className="logo-icon" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                    {(isSidebarOpen || isMobileMenuOpen) && <span className="logo-text">DMARC Mgr</span>}
                </div>

                <button className="sidebar-toggle" onClick={toggleSidebar}>
                    {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>

                <nav className="sidebar-nav">
                    <Link to="/" className={`nav-item ${isActive('/')}`}>
                        <LayoutDashboard size={20} />
                        {(isSidebarOpen || isMobileMenuOpen) && <span className="nav-text">Dashboard</span>}
                    </Link>

                    {user && (
                        <>
                            <Link to="/reports" className={`nav-item ${isActive('/reports')}`}>
                                <FileText size={20} />
                                {(isSidebarOpen || isMobileMenuOpen) && <span className="nav-text">Reports</span>}
                            </Link>
                            <Link to="/files" className={`nav-item ${isActive('/files')}`}>
                                <Database size={20} />
                                {(isSidebarOpen || isMobileMenuOpen) && <span className="nav-text">Files</span>}
                            </Link>
                            <Link to="/domains" className={`nav-item ${isActive('/domains')}`}>
                                <Globe size={20} />
                                {(isSidebarOpen || isMobileMenuOpen) && <span className="nav-text">Domains</span>}
                            </Link>
                        </>
                    )}

                    <div className="nav-spacer"></div>
                    <Link to="/settings" className={`nav-item ${isActive('/settings')}`}>
                        <Settings size={20} />
                        {(isSidebarOpen || isMobileMenuOpen) && <span className="nav-text">Settings</span>}
                    </Link>
                </nav>

                <div className="sidebar-footer">
                    {user && (
                        <button
                            className="nav-item btn-text"
                            style={{ width: '100%', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                            onClick={handleGlobalExport}
                        >
                            <FileDown size={20} />
                            {(isSidebarOpen || isMobileMenuOpen) && <span className="nav-text">Export Summary</span>}
                        </button>
                    )}
                    {user ? (
                        <div className="user-profile" style={{ cursor: 'default' }}>
                            <div className="avatar">{userInitials}</div>
                            {(isSidebarOpen || isMobileMenuOpen) && (
                                <div className="user-info">
                                    <span className="user-name">{fullName}</span>
                                    <button onClick={logout} className="btn-text" style={{ fontSize: '0.75rem', padding: 0, justifyContent: 'flex-start', color: 'rgba(255,255,255,0.5)' }}>
                                        <LogOut size={12} style={{ marginRight: '4px' }} />
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link to="/login" className="user-profile" style={{ textDecoration: 'none' }}>
                            <div className="avatar" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                <LogIn size={18} />
                            </div>
                            {(isSidebarOpen || isMobileMenuOpen) && (
                                <div className="user-info">
                                    <span className="user-name">Guest</span>
                                    <span className="user-role" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign In</span>
                                </div>
                            )}
                        </Link>
                    )}


                    <div className="version-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {(isSidebarOpen || isMobileMenuOpen) ? <span>v{version || '0.0.0'}</span> : <span></span>}
                        <button
                            onClick={toggleTheme}
                            className="btn-text"
                            style={{ color: 'rgba(255,255,255,0.3)', padding: '5px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}
                            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                        </button>
                    </div>
                </div>
            </aside>


            <main className="main-content">
                {children}
            </main>
        </div>
    );
};

export default Layout;
