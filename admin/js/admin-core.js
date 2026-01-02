/**
 * POP-SORTE Admin Dashboard - Core Module
 * 
 * This module provides:
 * - Hash-based SPA router for page navigation
 * - Session management with 12-hour TTL
 * - Shared utility functions (BRT timezone, CSV parsing)
 * - Auto-refresh mechanism (60 seconds)
 * - Event bus for inter-module communication
 * - Toast notification system
 */

// ============================================
// Global Admin Namespace
// ============================================
window.AdminCore = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    const SESSION_KEY = 'popsorte_admin_session';
    const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    const REFRESH_INTERVAL = 180 * 1000; // 3 minutes (extended for performance)
    const VALID_PAGES = ['dashboard', 'entries', 'results', 'winners'];
    const DEFAULT_PAGE = 'dashboard';

    // ============================================
    // State
    // ============================================
    let currentPage = null;
    let refreshTimer = null;
    let isRefreshing = false;
    let isPageLoading = false;
    const eventListeners = {};

    // ============================================
    // Event Bus
    // ============================================
    
    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    function on(event, callback) {
        if (!eventListeners[event]) {
            eventListeners[event] = [];
        }
        eventListeners[event].push(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    function off(event, callback) {
        if (!eventListeners[event]) return;
        eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to callbacks
     */
    function emit(event, data) {
        if (!eventListeners[event]) return;
        eventListeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    // ============================================
    // Brazil Timezone Utilities
    // ============================================
    
    /**
     * Get current time in Brazil timezone (BRT)
     * @returns {Date} Date object representing current Brazil time
     */
    function getBrazilTime() {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const hour = parts.find(p => p.type === 'hour').value;
        const minute = parts.find(p => p.type === 'minute').value;
        const second = parts.find(p => p.type === 'second').value;
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
    }

    /**
     * Format date/time in Brazil timezone
     * @param {Date} date - Date to format
     * @param {Object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date string
     */
    function formatBrazilDateTime(date, options = {}) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
            return '—';
        }
        return date.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            ...options
        });
    }

    /**
     * Get date string in YYYY-MM-DD format for Brazil timezone
     * @param {Date} date - Date to format
     * @returns {string} Date string in YYYY-MM-DD format
     */
    function getBrazilDateString(date) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        return `${year}-${month}-${day}`;
    }

    /**
     * Parse Brazilian date/time string to Date object
     * @param {string} str - Date string in format "DD/MM/YYYY HH:MM:SS"
     * @returns {Date|null} Parsed date or null if invalid
     */
    function parseBrazilDateTime(str) {
        if (!str) return null;
        try {
            const [datePart, timePart = '00:00:00'] = str.trim().split(' ');
            const [d, m, y] = datePart.split(/[\/\-]/).map(Number);
            const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
            if (!d || !m || !y) return null;
            // Create date in BRT (UTC-3)
            return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, ss));
        } catch {
            return null;
        }
    }

    // ============================================
    // CSV Parsing Utilities
    // ============================================
    
    /**
     * Detect the delimiter used in a CSV header line
     * @param {string} headerLine - First line of CSV
     * @returns {string} Detected delimiter
     */
    function detectDelimiter(headerLine) {
        const counts = {
            ',': (headerLine.match(/,/g) || []).length,
            ';': (headerLine.match(/;/g) || []).length,
            '\t': (headerLine.match(/\t/g) || []).length,
            '|': (headerLine.match(/\|/g) || []).length,
        };
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
    }

    /**
     * Parse a single CSV line respecting quoted fields
     * @param {string} line - CSV line to parse
     * @param {string} delimiter - Field delimiter
     * @returns {string[]} Array of field values
     */
    function parseCSVLine(line, delimiter = ',') {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === delimiter && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current.trim());
        return values;
    }

    /**
     * Parse complete CSV text to array of objects
     * @param {string} csvText - Raw CSV text
     * @returns {Object[]} Array of row objects with header keys
     */
    function parseCSV(csvText) {
        const lines = csvText.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return [];

        const delimiter = detectDelimiter(lines[0]);
        const headers = parseCSVLine(lines[0], delimiter);
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i], delimiter);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            rows.push(row);
        }

        return rows;
    }

    // ============================================
    // WhatsApp Masking
    // ============================================
    
    /**
     * Mask WhatsApp number showing only last 4 digits
     * @param {string} number - Full phone number
     * @returns {string} Masked number
     */
    function maskWhatsApp(number) {
        if (!number) return '****';
        const digits = number.replace(/\D/g, '');
        if (digits.length < 4) return '****';
        return '***' + digits.slice(-4);
    }

    // ============================================
    // Number Ball Color Utility
    // ============================================
    
    /**
     * Get CSS class for lottery ball color based on number
     * @param {number} num - Lottery number
     * @returns {string} CSS class name
     */
    function getBallColorClass(num) {
        return `ball-color-${num % 10}`;
    }

    // ============================================
    // Toast Notifications
    // ============================================
    
    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type - Type: 'default', 'success', 'error', 'warning'
     * @param {number} duration - Duration in ms (default 3000)
     */
    function showToast(message, type = 'default', duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = message;
        toast.className = 'toast show';
        
        if (type !== 'default') {
            toast.classList.add(type);
        }

        setTimeout(() => {
            toast.className = 'toast';
        }, duration);
    }

    /**
     * Hide toast notification immediately
     */
    function hideToast() {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.className = 'toast';
        }
    }

    // ============================================
    // Loading Overlay
    // ============================================
    
    /**
     * Show loading overlay
     * @param {string} text - Loading message
     */
    function showLoading(text = 'Loading data...') {
        isPageLoading = true;
        const overlay = document.getElementById('loadingOverlay');
        const textEl = document.getElementById('loadingText');
        const progressEl = document.getElementById('loadingProgress');
        
        if (overlay) {
            overlay.classList.remove('hidden');
            if (textEl) textEl.textContent = text;
            if (progressEl) progressEl.style.width = '0%';
        }
    }

    /**
     * Update loading progress
     * @param {number} percent - Progress percentage (0-100)
     * @param {string} text - Optional new text
     */
    function updateLoadingProgress(percent, text) {
        const progressEl = document.getElementById('loadingProgress');
        const textEl = document.getElementById('loadingText');
        
        if (progressEl) {
            progressEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
        if (text && textEl) {
            textEl.textContent = text;
        }
    }

    /**
     * Hide loading overlay
     */
    function hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
        isPageLoading = false;
    }

    /**
     * Set page loading state (blocks auto-refresh)
     * @param {boolean} loading - Whether page is loading
     */
    function setPageLoading(loading) {
        isPageLoading = loading;
    }

    // ============================================
    // Performance Utilities
    // ============================================
    
    /**
     * Debounce function - delays execution until after wait ms have elapsed
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function - limits execution to once per wait ms
     * @param {Function} func - Function to throttle
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Throttled function
     */
    function throttle(func, wait = 100) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, wait);
            }
        };
    }

    /**
     * Request idle callback with fallback for Safari
     * @param {Function} callback - Function to execute during idle time
     */
    function requestIdleExecution(callback) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(callback, { timeout: 2000 });
        } else {
            setTimeout(callback, 1);
        }
    }

    // ============================================
    // Session Management
    // ============================================
    
    /**
     * Get current session from sessionStorage
     * @returns {Object|null} Session object or null if expired/invalid
     */
    function getSession() {
        try {
            const sessionData = sessionStorage.getItem(SESSION_KEY);
            if (!sessionData) return null;

            const session = JSON.parse(sessionData);
            const now = Date.now();

            // Check if session has expired
            if (session.expiresAt && now > session.expiresAt) {
                clearSession();
                return null;
            }

            return session;
        } catch {
            clearSession();
            return null;
        }
    }

    /**
     * Create a new session
     * @param {string} username - Authenticated username
     * @returns {Object} Created session object
     */
    function createSession(username) {
        const session = {
            username,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }

    /**
     * Clear current session
     */
    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} True if valid session exists
     */
    function isAuthenticated() {
        return getSession() !== null;
    }

    // ============================================
    // Router
    // ============================================
    
    /**
     * Get current page from URL hash
     * @returns {string} Page name
     */
    function getCurrentPageFromHash() {
        const hash = window.location.hash.slice(1) || DEFAULT_PAGE;
        return VALID_PAGES.includes(hash) ? hash : DEFAULT_PAGE;
    }

    /**
     * Navigate to a specific page
     * @param {string} page - Page name to navigate to
     */
    function navigateTo(page) {
        if (!VALID_PAGES.includes(page)) {
            page = DEFAULT_PAGE;
        }
        window.location.hash = page;
    }

    /**
     * Handle route change
     */
    function handleRouteChange() {
        const page = getCurrentPageFromHash();
        
        if (page === currentPage) return;
        currentPage = page;

        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === page);
        });

        // Update page title
        const pageTitles = {
            dashboard: 'Dashboard',
            entries: 'Entries',
            results: 'Results',
            winners: 'Winners'
        };
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.textContent = pageTitles[page] || 'Dashboard';
        }

        // Show/hide pages
        document.querySelectorAll('.page').forEach(pageEl => {
            const isActive = pageEl.id === `page-${page}`;
            pageEl.classList.toggle('active', isActive);
        });

        // Emit page change event
        emit('pageChange', { page });
    }

    /**
     * Initialize router
     */
    function initRouter() {
        window.addEventListener('hashchange', handleRouteChange);
        
        // Handle nav link clicks
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                if (page) {
                    navigateTo(page);
                    // Close sidebar on mobile
                    document.querySelector('.sidebar')?.classList.remove('open');
                }
            });
        });

        // Set initial route
        handleRouteChange();
    }

    // ============================================
    // Auto-Refresh
    // ============================================
    
    /**
     * Update last refresh timestamp display
     */
    function updateLastRefreshDisplay() {
        const el = document.getElementById('lastRefresh');
        if (el) {
            el.textContent = `Last update: ${formatBrazilDateTime(new Date(), {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })}`;
        }
    }

    /**
     * Trigger data refresh
     */
    async function refreshData() {
        // Skip refresh if page is loading or already refreshing
        if (isRefreshing || isPageLoading) {
            console.log('Skipping auto-refresh - page is loading or already refreshing');
            return;
        }
        
        isRefreshing = true;
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳';
        }

        try {
            emit('refresh');
            updateLastRefreshDisplay();
        } catch (error) {
            console.error('Refresh error:', error);
            showToast('Error refreshing data', 'error');
        } finally {
            isRefreshing = false;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄';
            }
        }
    }

    /**
     * Start auto-refresh timer
     */
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
    }

    /**
     * Stop auto-refresh timer
     */
    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    // ============================================
    // UI Utilities
    // ============================================
    
    /**
     * Show the main app container and hide login
     */
    function showApp() {
        const loginModal = document.getElementById('loginModal');
        const appContainer = document.getElementById('appContainer');
        
        if (loginModal) loginModal.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';

        // Update user display
        const session = getSession();
        const userNameEl = document.getElementById('currentUser');
        if (userNameEl && session) {
            userNameEl.textContent = session.username;
        }
    }

    /**
     * Show login modal and hide app
     */
    function showLogin() {
        const loginModal = document.getElementById('loginModal');
        const appContainer = document.getElementById('appContainer');
        
        if (loginModal) loginModal.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }

    /**
     * Toggle sidebar on mobile
     */
    function toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    }

    /**
     * Open a modal by ID
     * @param {string} modalId - Modal element ID
     */
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    /**
     * Close a modal by ID
     * @param {string} modalId - Modal element ID
     */
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Update connection status indicator
     * @param {boolean} online - Whether online
     */
    function setConnectionStatus(online) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.className = `connection-status ${online ? 'online' : 'offline'}`;
            statusEl.querySelector('.status-text').textContent = online ? 'Online' : 'Offline';
        }
    }

    // ============================================
    // Initialization
    // ============================================
    
    /**
     * Initialize core module
     */
    function init() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', toggleSidebar);
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshData);
        }

        // Modal close buttons
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                closeModal(btn.dataset.close);
            });
        });

        // Close modal on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay && overlay.id !== 'loginModal') {
                    overlay.style.display = 'none';
                }
            });
        });

        // Online/offline detection
        window.addEventListener('online', () => setConnectionStatus(true));
        window.addEventListener('offline', () => setConnectionStatus(false));
        setConnectionStatus(navigator.onLine);

        // Check authentication
        if (isAuthenticated()) {
            showApp();
            initRouter();
            startAutoRefresh();
            updateLastRefreshDisplay();
        } else {
            showLogin();
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Event bus
        on,
        off,
        emit,
        
        // Session
        getSession,
        createSession,
        clearSession,
        isAuthenticated,
        
        // Router
        navigateTo,
        getCurrentPage: () => currentPage,
        
        // UI
        showApp,
        showLogin,
        showToast,
        hideToast,
        openModal,
        closeModal,
        showLoading,
        updateLoadingProgress,
        hideLoading,
        setPageLoading,
        
        // Refresh
        refreshData,
        startAutoRefresh,
        stopAutoRefresh,
        
        // Utilities
        getBrazilTime,
        formatBrazilDateTime,
        getBrazilDateString,
        parseBrazilDateTime,
        parseCSV,
        parseCSVLine,
        detectDelimiter,
        maskWhatsApp,
        getBallColorClass,
        
        // Performance utilities
        debounce,
        throttle,
        requestIdleExecution,
        
        // Constants
        VALID_PAGES,
        DEFAULT_PAGE
    };
})();

