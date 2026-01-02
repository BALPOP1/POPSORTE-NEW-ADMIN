/**
 * POP-SORTE Admin Dashboard - Entries Page Module
 * 
 * LAZY LOADING ARCHITECTURE:
 * - Shows entries immediately from cached data
 * - Validates ONLY visible rows (current page)
 * - Stats show quick estimates, then accurate counts load in background
 * 
 * Dependencies: AdminCore, DataStore
 */

// ============================================
// Entries Page Module
// ============================================
window.EntriesPage = (function() {
    'use strict';

    // ============================================
    // State
    // ============================================
    let isInitialized = false;
    let filteredEntries = [];
    let currentPage = 1;
    let perPage = 25;
    let filters = {
        gameId: '',
        whatsapp: '',
        contest: '',
        drawDate: '',
        validity: 'all',
        cutoff: 'all'
    };
    let isFiltering = false;

    // ============================================
    // HTML Templates
    // ============================================
    
    function getTemplate() {
        return `
            <div class="entries-content">
                <!-- Status Banner -->
                <div id="validationBanner" class="status-banner info">
                    <span class="status-banner-icon">⏳</span>
                    <span class="status-banner-text">Loading data...</span>
                </div>

                <!-- Statistics - Quick counts first, accurate counts load in background -->
                <div class="stats-grid mb-4" id="entriesStats">
                    <div class="stat-card success">
                        <span class="stat-label" title="Entries with valid recharge">✓ Valid (est.)</span>
                        <span class="stat-value" id="statValid">--</span>
                    </div>
                    <div class="stat-card danger">
                        <span class="stat-label" title="No matching recharge">✗ Invalid (est.)</span>
                        <span class="stat-value" id="statInvalid">--</span>
                    </div>
                    <div class="stat-card primary">
                        <span class="stat-label" title="Total entries">📊 Total</span>
                        <span class="stat-value" id="statTotal">--</span>
                    </div>
                    <div class="stat-card warning">
                        <span class="stat-label" title="Unique players">👥 Players</span>
                        <span class="stat-value" id="statPlayers">--</span>
                    </div>
                </div>

                <!-- Filters -->
                <div class="filters-row">
                    <div class="filter-group">
                        <label>Game ID</label>
                        <input type="text" id="filterGameId" placeholder="Search ID...">
                    </div>
                    <div class="filter-group">
                        <label>WhatsApp</label>
                        <input type="text" id="filterWhatsapp" placeholder="Search WhatsApp...">
                    </div>
                    <div class="filter-group">
                        <label>Contest</label>
                        <select id="filterContest">
                            <option value="">All</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Draw Date</label>
                        <select id="filterDrawDate">
                            <option value="">All</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Validity</label>
                        <select id="filterValidity">
                            <option value="all">All</option>
                            <option value="valid">Valid</option>
                            <option value="invalid">Invalid</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button id="btnClearFilters" class="btn btn-secondary btn-sm">Clear</button>
                        <button id="btnExportCSV" class="btn btn-primary btn-sm">📥 Export</button>
                    </div>
                </div>

                <!-- Entries Table -->
                <div class="card">
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Date/Time</th>
                                    <th>Platform</th>
                                    <th>Game ID</th>
                                    <th>WhatsApp</th>
                                    <th>Numbers</th>
                                    <th>Draw</th>
                                    <th>Contest</th>
                                    <th>Ticket #</th>
                                </tr>
                            </thead>
                            <tbody id="entriesTableBody">
                                <tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination -->
                    <div class="pagination">
                        <div class="pagination-info" id="paginationInfo">
                            Showing 0-0 of 0
                        </div>
                        <div class="pagination-controls">
                            <select id="perPageSelect" class="pagination-btn">
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                            <button id="btnPrevPage" class="pagination-btn" disabled>←</button>
                            <span id="pageNumbers"></span>
                            <button id="btnNextPage" class="pagination-btn">→</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // Quick Stats (No heavy processing)
    // ============================================
    
    function renderQuickStats() {
        const counts = DataStore.getCounts();
        
        document.getElementById('statTotal').textContent = counts.totalEntries.toLocaleString();
        document.getElementById('statPlayers').textContent = counts.uniquePlayers.toLocaleString();
        document.getElementById('statValid').textContent = counts.estimatedValid.toLocaleString();
        document.getElementById('statInvalid').textContent = counts.estimatedInvalid.toLocaleString();
        
        // Update banner
        const banner = document.getElementById('validationBanner');
        if (banner) {
            banner.className = 'status-banner success';
            banner.innerHTML = `
                <span class="status-banner-icon">✅</span>
                <span class="status-banner-text">${counts.totalEntries.toLocaleString()} entries loaded. ${counts.totalRecharges.toLocaleString()} recharges.</span>
            `;
        }
    }

    // ============================================
    // Filter Logic
    // ============================================
    
    function applyFilters() {
        if (isFiltering) return;
        isFiltering = true;
        
        try {
            let entries = DataStore.getEntries();
            
            // Apply simple text/dropdown filters
            if (filters.gameId) {
                const term = filters.gameId.toLowerCase();
                entries = entries.filter(e => e.gameId.toLowerCase().includes(term));
            }
            
            if (filters.whatsapp) {
                const term = filters.whatsapp.toLowerCase();
                entries = entries.filter(e => (e.whatsapp || '').toLowerCase().includes(term));
            }
            
            if (filters.contest) {
                entries = entries.filter(e => e.contest === filters.contest);
            }
            
            if (filters.drawDate) {
                entries = entries.filter(e => e.drawDate === filters.drawDate);
            }
            
            // Validation filter - needs on-demand validation
            if (filters.validity !== 'all') {
                entries = entries.filter(e => {
                    const validation = DataStore.validateEntry(e);
                    if (filters.validity === 'valid') return validation.status === 'VALID';
                    if (filters.validity === 'invalid') return validation.status === 'INVALID';
                    return true;
                });
            }
            
            filteredEntries = entries;
            currentPage = 1;
            renderTable();
            renderPagination();
        } finally {
            isFiltering = false;
        }
    }
    
    function clearFilters() {
        filters = { gameId: '', whatsapp: '', contest: '', drawDate: '', validity: 'all', cutoff: 'all' };
        
        document.getElementById('filterGameId').value = '';
        document.getElementById('filterWhatsapp').value = '';
        document.getElementById('filterContest').value = '';
        document.getElementById('filterDrawDate').value = '';
        document.getElementById('filterValidity').value = 'all';
        
        applyFilters();
    }

    // ============================================
    // Table Rendering - Only validate visible rows
    // ============================================
    
    function renderTable() {
        const tbody = document.getElementById('entriesTableBody');
        if (!tbody) return;
        
        // Get current page entries
        const start = (currentPage - 1) * perPage;
        const pageEntries = filteredEntries.slice(start, start + perPage);
        
        if (pageEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No entries found</td></tr>';
            return;
        }
        
        // Validate ONLY visible entries (lazy loading!)
        const html = pageEntries.map(entry => {
            // On-demand validation for this specific entry
            const validation = DataStore.validateEntry(entry);
            const status = validation.status;
            
            // Status badge
            let statusBadge = '';
            switch (status) {
                case 'VALID':
                    statusBadge = `<span class="badge badge-success" title="${validation.reason}">✅ VALID</span>`;
                    break;
                case 'INVALID':
                    statusBadge = `<span class="badge badge-danger" title="${validation.reason}">❌ INVALID</span>`;
                    break;
                default:
                    statusBadge = '<span class="badge badge-warning">⏳ PENDING</span>';
            }
            
            if (validation.isCutoff) {
                statusBadge += ' <span class="badge badge-gray" title="After 20:00 BRT">CUTOFF</span>';
            }
            
            // Numbers display
            const numbersHtml = entry.numbers.map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:22px;height:22px;font-size:0.6rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            // Format time
            const time = entry.parsedDate
                ? AdminCore.formatBrazilDateTime(entry.parsedDate, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
                : entry.timestamp;
            
            return `
                <tr onclick="EntriesPage.showDetails('${entry.ticketNumber}')" style="cursor:pointer">
                    <td>${statusBadge}</td>
                    <td style="font-size:0.8rem;white-space:nowrap">${time}</td>
                    <td><span class="badge badge-info">${entry.platform}</span></td>
                    <td><strong>${entry.gameId}</strong></td>
                    <td>${AdminCore.maskWhatsApp(entry.whatsapp)}</td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td>${entry.drawDate}</td>
                    <td>${entry.contest}</td>
                    <td style="font-size:0.75rem">${entry.ticketNumber}</td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = html;
    }

    function renderPagination() {
        const total = filteredEntries.length;
        const totalPages = Math.ceil(total / perPage);
        const start = (currentPage - 1) * perPage + 1;
        const end = Math.min(currentPage * perPage, total);
        
        document.getElementById('paginationInfo').textContent = 
            `Showing ${total > 0 ? start : 0}-${end} of ${total}`;
        
        document.getElementById('btnPrevPage').disabled = currentPage <= 1;
        document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
        
        // Page numbers
        const pageNumbers = document.getElementById('pageNumbers');
        if (pageNumbers && totalPages > 0) {
            let html = '';
            const maxButtons = 5;
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, startPage + maxButtons - 1);
            
            for (let i = startPage; i <= endPage; i++) {
                html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" 
                    onclick="EntriesPage.goToPage(${i})">${i}</button>`;
            }
            if (endPage < totalPages) {
                html += `<span class="text-muted">...${totalPages}</span>`;
            }
            pageNumbers.innerHTML = html;
        }
    }

    function renderFilterOptions() {
        const entries = DataStore.getEntries();
        
        // Contests
        const contests = [...new Set(entries.map(e => e.contest).filter(Boolean))]
            .sort((a, b) => parseInt(b) - parseInt(a));
        const contestSelect = document.getElementById('filterContest');
        if (contestSelect) {
            contestSelect.innerHTML = '<option value="">All</option>' +
                contests.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        
        // Draw dates
        const dates = [...new Set(entries.map(e => e.drawDate).filter(Boolean))].sort().reverse();
        const dateSelect = document.getElementById('filterDrawDate');
        if (dateSelect) {
            dateSelect.innerHTML = '<option value="">All</option>' +
                dates.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    }

    // ============================================
    // Details Modal
    // ============================================
    
    function showDetails(ticketNumber) {
        const entries = DataStore.getEntries();
        const entry = entries.find(e => e.ticketNumber === ticketNumber);
        if (!entry) return;
        
        const validation = DataStore.validateEntry(entry);
        const modalContent = document.getElementById('ticketModalContent');
        if (!modalContent) return;
        
        // Status banner
        const statusClass = validation.status === 'VALID' ? 'success' : validation.status === 'INVALID' ? 'danger' : 'warning';
        const statusIcon = validation.status === 'VALID' ? '✅' : validation.status === 'INVALID' ? '❌' : '⏳';
        
        // Numbers
        const numbersHtml = entry.numbers.map(n => {
            const colorClass = AdminCore.getBallColorClass(n);
            return `<span class="number-badge ${colorClass}">${String(n).padStart(2, '0')}</span>`;
        }).join('');
        
        // Recharge info
        let rechargeHtml = '<p class="text-muted">No linked recharge</p>';
        if (validation.matchedRecharge) {
            const r = validation.matchedRecharge;
            rechargeHtml = `
                <p><strong>Amount:</strong> R$ ${r.amount?.toFixed(2) || '?'}</p>
                <p><strong>Time:</strong> ${r.rechargeTime ? AdminCore.formatBrazilDateTime(r.rechargeTime) : '-'}</p>
            `;
        }
        
        modalContent.innerHTML = `
            <div class="status-banner ${statusClass} mb-4">
                <span class="status-banner-icon">${statusIcon}</span>
                <span class="status-banner-text">
                    <strong>${validation.status}</strong> - ${validation.reason}
                    ${validation.isCutoff ? '<br><span class="text-warning">⚠️ After cutoff</span>' : ''}
                </span>
            </div>
            
            <h4>Ticket Info</h4>
            <div class="ticket-info-grid mb-4">
                <div class="ticket-info-item"><span class="label">Ticket</span><span class="value">${entry.ticketNumber}</span></div>
                <div class="ticket-info-item"><span class="label">Game ID</span><span class="value">${entry.gameId}</span></div>
                <div class="ticket-info-item"><span class="label">WhatsApp</span><span class="value">${entry.whatsapp || '-'}</span></div>
                <div class="ticket-info-item"><span class="label">Contest</span><span class="value">${entry.contest}</span></div>
                <div class="ticket-info-item"><span class="label">Draw</span><span class="value">${entry.drawDate}</span></div>
                <div class="ticket-info-item"><span class="label">Registered</span><span class="value">${entry.parsedDate ? AdminCore.formatBrazilDateTime(entry.parsedDate) : entry.timestamp}</span></div>
            </div>
            
            <h4>Numbers</h4>
            <div class="numbers-display mb-4">${numbersHtml}</div>
            
            <h4>Recharge</h4>
            ${rechargeHtml}
        `;
        
        AdminCore.openModal('ticketModal');
    }

    // ============================================
    // Export
    // ============================================
    
    function exportCSV() {
        if (filteredEntries.length === 0) {
            AdminCore.showToast('No data to export', 'warning');
            return;
        }
        
        const headers = ['Status', 'Date/Time', 'Platform', 'Game ID', 'WhatsApp', 'Numbers', 'Draw Date', 'Contest', 'Ticket #'];
        const rows = filteredEntries.map(entry => {
            const validation = DataStore.validateEntry(entry);
            return [
                validation.status,
                entry.timestamp,
                entry.platform,
                entry.gameId,
                entry.whatsapp,
                entry.numbers.join(', '),
                entry.drawDate,
                entry.contest,
                entry.ticketNumber
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entries_${AdminCore.getBrazilDateString(new Date())}.csv`;
        link.click();
        
        AdminCore.showToast(`${filteredEntries.length} entries exported`, 'success');
    }

    // ============================================
    // Navigation
    // ============================================
    
    function goToPage(page) {
        currentPage = page;
        renderTable();
        renderPagination();
    }

    // ============================================
    // Event Binding
    // ============================================
    
    const debouncedFilter = AdminCore.debounce(applyFilters, 300);
    
    function bindEvents() {
        document.getElementById('filterGameId')?.addEventListener('input', e => { filters.gameId = e.target.value; debouncedFilter(); });
        document.getElementById('filterWhatsapp')?.addEventListener('input', e => { filters.whatsapp = e.target.value; debouncedFilter(); });
        document.getElementById('filterContest')?.addEventListener('change', e => { filters.contest = e.target.value; applyFilters(); });
        document.getElementById('filterDrawDate')?.addEventListener('change', e => { filters.drawDate = e.target.value; applyFilters(); });
        document.getElementById('filterValidity')?.addEventListener('change', e => { filters.validity = e.target.value; applyFilters(); });
        
        document.getElementById('btnClearFilters')?.addEventListener('click', clearFilters);
        document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
        
        document.getElementById('btnPrevPage')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); renderPagination(); } });
        document.getElementById('btnNextPage')?.addEventListener('click', () => { 
            const totalPages = Math.ceil(filteredEntries.length / perPage);
            if (currentPage < totalPages) { currentPage++; renderTable(); renderPagination(); }
        });
        document.getElementById('perPageSelect')?.addEventListener('change', e => { perPage = parseInt(e.target.value); currentPage = 1; renderTable(); renderPagination(); });
    }

    // ============================================
    // Initialization
    // ============================================
    
    async function init() {
        const container = document.getElementById('page-entries');
        if (!container) return;
        
        container.innerHTML = getTemplate();
        bindEvents();
        
        // Load data through DataStore (cached, fast)
        await DataStore.loadData();
        
        // Show data immediately
        filteredEntries = DataStore.getEntries();
        renderQuickStats();
        renderFilterOptions();
        renderTable();
        renderPagination();
        
        isInitialized = true;
    }

    function refresh() {
        if (!isInitialized) return;
        
        // Use latest data from DataStore
        filteredEntries = DataStore.getEntries();
        renderQuickStats();
        applyFilters();
    }

    // Listen for page changes
    if (typeof AdminCore !== 'undefined') {
        AdminCore.on('pageChange', ({ page }) => {
            if (page === 'entries' && !isInitialized) {
                init();
            }
        });
        
        AdminCore.on('refresh', () => {
            if (AdminCore.getCurrentPage() === 'entries') {
                DataStore.loadData(true).then(refresh);
            }
        });
        
        AdminCore.on('dataStoreReady', () => {
            if (AdminCore.getCurrentPage() === 'entries') {
                refresh();
            }
        });
    }

    return { init, refresh, showDetails, goToPage, exportCSV };
})();
