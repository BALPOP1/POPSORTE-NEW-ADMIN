/**
 * POP-SORTE Admin Dashboard - Entries Page Module
 * 
 * This module renders the entries management page with:
 * - Validation status banner
 * - Statistics row (Valid/Invalid/Cutoff/Total)
 * - Full entries table with filters
 * - Pagination (25/50/100 per page)
 * - CSV export
 * - Ticket details modal
 * 
 * Dependencies: AdminCore, DataFetcher, RechargeValidator
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
    let currentData = {
        entries: [],
        recharges: [],
        validationResults: null
    };
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

    // ============================================
    // HTML Templates
    // ============================================
    
    function getTemplate() {
        return `
            <div class="entries-content">
                <!-- Validation Status Banner -->
                <div id="validationBanner" class="status-banner info">
                    <span class="status-banner-icon">ℹ️</span>
                    <span class="status-banner-text">Loading validation data...</span>
                </div>

                <!-- Statistics -->
                <div class="stats-grid mb-4" id="entriesStats">
                    <div class="stat-card success">
                        <span class="stat-label" title="Entries with valid recharge match">✓ Valid</span>
                        <span class="stat-value" id="statValid">--</span>
                    </div>
                    <div class="stat-card danger">
                        <span class="stat-label" title="No recharge found, or recharge timing doesn't match draw date">✗ Invalid</span>
                        <span class="stat-value" id="statInvalid">--</span>
                    </div>
                    <div class="stat-card warning">
                        <span class="stat-label" title="Registered after 20:00 BRT cutoff time">⏰ After Cutoff</span>
                        <span class="stat-value" id="statCutoff">--</span>
                    </div>
                    <div class="stat-card primary">
                        <span class="stat-label" title="Total recharge transactions loaded">📊 Total Recharges</span>
                        <span class="stat-value" id="statRecharges">--</span>
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
                            <option value="unknown">Pending</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Cutoff</label>
                        <select id="filterCutoff">
                            <option value="all">All</option>
                            <option value="yes">After Cutoff</option>
                            <option value="no">Before Cutoff</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button id="btnClearFilters" class="btn btn-secondary btn-sm">Clear</button>
                        <button id="btnExportCSV" class="btn btn-primary btn-sm">📥 Export CSV</button>
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
                                    <th>Recharge</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="entriesTableBody">
                                <tr><td colspan="11" class="text-center text-muted">Loading entries...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination -->
                    <div class="pagination">
                        <div class="pagination-info" id="paginationInfo">
                            Showing 0-0 of 0 entries
                        </div>
                        <div class="pagination-controls">
                            <select id="perPageSelect" class="pagination-btn">
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                            <button id="btnPrevPage" class="pagination-btn" disabled>← Previous</button>
                            <span id="pageNumbers"></span>
                            <button id="btnNextPage" class="pagination-btn">Next →</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // Filter Functions
    // ============================================
    
    function applyFilters() {
        let result = [...currentData.entries];
        
        // Get validation results map
        const validationMap = new Map();
        if (currentData.validationResults) {
            currentData.validationResults.results.forEach(v => {
                validationMap.set(v.ticket.ticketNumber, v);
            });
        }
        
        // Game ID filter
        if (filters.gameId) {
            const term = filters.gameId.toLowerCase();
            result = result.filter(e => e.gameId.toLowerCase().includes(term));
        }
        
        // WhatsApp filter
        if (filters.whatsapp) {
            const term = filters.whatsapp.toLowerCase();
            result = result.filter(e => (e.whatsapp || '').toLowerCase().includes(term));
        }
        
        // Contest filter
        if (filters.contest) {
            result = result.filter(e => e.contest === filters.contest);
        }
        
        // Draw date filter
        if (filters.drawDate) {
            result = result.filter(e => e.drawDate === filters.drawDate);
        }
        
        // Validity filter
        if (filters.validity !== 'all') {
            result = result.filter(e => {
                const validation = validationMap.get(e.ticketNumber);
                const status = validation?.status || 'UNKNOWN';
                
                switch (filters.validity) {
                    case 'valid':
                        return status === 'VALID';
                    case 'invalid':
                        return status === 'INVALID';
                    case 'unknown':
                        return status === 'UNKNOWN';
                    default:
                        return true;
                }
            });
        }
        
        // Cutoff filter
        if (filters.cutoff !== 'all') {
            result = result.filter(e => {
                const validation = validationMap.get(e.ticketNumber);
                const isCutoff = validation?.isCutoff || false;
                
                return filters.cutoff === 'yes' ? isCutoff : !isCutoff;
            });
        }
        
        filteredEntries = result;
        currentPage = 1;
        renderTable();
        renderPagination();
    }

    function clearFilters() {
        filters = {
            gameId: '',
            whatsapp: '',
            contest: '',
            drawDate: '',
            validity: 'all',
            cutoff: 'all'
        };
        
        document.getElementById('filterGameId').value = '';
        document.getElementById('filterWhatsapp').value = '';
        document.getElementById('filterContest').value = '';
        document.getElementById('filterDrawDate').value = '';
        document.getElementById('filterValidity').value = 'all';
        document.getElementById('filterCutoff').value = 'all';
        
        applyFilters();
    }

    // ============================================
    // Render Functions
    // ============================================
    
    function renderStats() {
        const { validationResults, recharges } = currentData;
        
        if (validationResults) {
            document.getElementById('statValid').textContent = validationResults.stats.valid.toLocaleString();
            document.getElementById('statInvalid').textContent = validationResults.stats.invalid.toLocaleString();
            document.getElementById('statCutoff').textContent = validationResults.stats.cutoff.toLocaleString();
        }
        
        document.getElementById('statRecharges').textContent = recharges.length.toLocaleString();
    }

    function renderValidationBanner() {
        const banner = document.getElementById('validationBanner');
        const { validationResults, recharges } = currentData;
        
        if (!banner) return;
        
        if (recharges.length === 0) {
            banner.className = 'status-banner warning';
            banner.innerHTML = `
                <span class="status-banner-icon">⚠️</span>
                <span class="status-banner-text">Recharge data not loaded. Validation may be incomplete.</span>
            `;
        } else if (validationResults) {
            const lastUpdate = AdminCore.formatBrazilDateTime(new Date(), {
                hour: '2-digit',
                minute: '2-digit'
            });
            banner.className = 'status-banner success';
            banner.innerHTML = `
                <span class="status-banner-icon">✅</span>
                <span class="status-banner-text">Validation loaded. ${recharges.length} recharges processed. Last update: ${lastUpdate}</span>
            `;
        }
    }

    function renderFilterOptions() {
        const { entries } = currentData;
        
        // Populate contest options
        const contests = [...new Set(entries.map(e => e.contest).filter(Boolean))].sort((a, b) => {
            return parseInt(b, 10) - parseInt(a, 10);
        });
        
        const contestSelect = document.getElementById('filterContest');
        if (contestSelect) {
            contestSelect.innerHTML = '<option value="">All</option>' +
                contests.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        
        // Populate draw date options
        const drawDates = [...new Set(entries.map(e => e.drawDate).filter(Boolean))].sort().reverse();
        
        const drawDateSelect = document.getElementById('filterDrawDate');
        if (drawDateSelect) {
            drawDateSelect.innerHTML = '<option value="">All</option>' +
                drawDates.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    }

    function renderTable() {
        const tbody = document.getElementById('entriesTableBody');
        if (!tbody) return;
        
        // Get validation results map
        const validationMap = new Map();
        if (currentData.validationResults) {
            currentData.validationResults.results.forEach(v => {
                validationMap.set(v.ticket.ticketNumber, v);
            });
        }
        
        // Calculate pagination
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;
        const pageEntries = filteredEntries.slice(start, end);
        
        if (pageEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No entries found</td></tr>';
            return;
        }
        
        tbody.innerHTML = pageEntries.map(entry => {
            const validation = validationMap.get(entry.ticketNumber);
            const status = validation?.status || 'UNKNOWN';
            const isCutoff = validation?.isCutoff || false;
            
            // Status badge with reason tooltip
            const reason = validation?.reason || '';
            let statusBadge = '';
            switch (status) {
                case 'VALID':
                    statusBadge = `<span class="badge badge-success" title="${reason}">✅ VALID</span>`;
                    break;
                case 'INVALID':
                    statusBadge = `<span class="badge badge-danger" title="${reason}">❌ INVALID</span>`;
                    break;
                default:
                    statusBadge = '<span class="badge badge-warning" title="Validation pending">⏳ PENDING</span>';
            }
            
            if (isCutoff) {
                statusBadge += ' <span class="badge badge-gray" title="Registered after 20:00 BRT cutoff">CUTOFF</span>';
            }
            
            // Numbers
            const numbersHtml = entry.numbers.map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width: 24px; height: 24px; font-size: 0.6rem;">${String(n).padStart(2, '0')}</span>`;
            }).join('');
            
            // Format timestamp
            const formattedTime = entry.parsedDate
                ? AdminCore.formatBrazilDateTime(entry.parsedDate, {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : entry.timestamp;
            
            // Recharge info
            let rechargeInfo = '-';
            if (validation?.matchedRecharge) {
                const r = validation.matchedRecharge;
                rechargeInfo = `<span class="text-success" style="font-size: 0.75rem;">
                    R$${r.amount?.toFixed(2) || '?'}
                </span>`;
            }
            
            return `
                <tr>
                    <td>${statusBadge}</td>
                    <td style="font-size: 0.8rem; white-space: nowrap;">${formattedTime}</td>
                    <td><span class="badge badge-info">${entry.platform}</span></td>
                    <td><strong>${entry.gameId}</strong></td>
                    <td>${AdminCore.maskWhatsApp(entry.whatsapp)}</td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td>${entry.drawDate}</td>
                    <td>${entry.contest}</td>
                    <td style="font-size: 0.75rem;">${entry.ticketNumber}</td>
                    <td>${rechargeInfo}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="EntriesPage.showDetails('${entry.ticketNumber}')">
                            Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderPagination() {
        const total = filteredEntries.length;
        const totalPages = Math.ceil(total / perPage);
        const start = (currentPage - 1) * perPage + 1;
        const end = Math.min(currentPage * perPage, total);
        
        // Update info
        document.getElementById('paginationInfo').textContent = 
            `Showing ${total > 0 ? start : 0}-${end} of ${total} entries`;
        
        // Update buttons
        document.getElementById('btnPrevPage').disabled = currentPage <= 1;
        document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
        
        // Page numbers
        const pageNumbers = document.getElementById('pageNumbers');
        if (pageNumbers) {
            let html = '';
            for (let i = 1; i <= Math.min(totalPages, 5); i++) {
                html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" 
                    onclick="EntriesPage.goToPage(${i})">${i}</button>`;
            }
            if (totalPages > 5) {
                html += `<span class="text-muted">... ${totalPages}</span>`;
            }
            pageNumbers.innerHTML = html;
        }
    }

    // ============================================
    // Modal Functions
    // ============================================
    
    function showDetails(ticketNumber) {
        const entry = currentData.entries.find(e => e.ticketNumber === ticketNumber);
        if (!entry) return;
        
        // Get validation
        const validationMap = new Map();
        if (currentData.validationResults) {
            currentData.validationResults.results.forEach(v => {
                validationMap.set(v.ticket.ticketNumber, v);
            });
        }
        const validation = validationMap.get(ticketNumber);
        
        const modalContent = document.getElementById('ticketModalContent');
        if (!modalContent) return;
        
        // Status info
        let statusHtml = '';
        if (validation) {
            const status = validation.status;
            const statusClass = {
                'VALID': 'success',
                'INVALID': 'danger',
                'UNKNOWN': 'warning'
            }[status] || 'warning';
            
            statusHtml = `
                <div class="status-banner ${statusClass} mb-4">
                    <span class="status-banner-icon">${status === 'VALID' ? '✅' : status === 'INVALID' ? '❌' : '⏳'}</span>
                    <span class="status-banner-text">
                        <strong>${status}</strong> - ${validation.reason || 'Checking...'}
                        ${validation.isCutoff ? '<br><span class="text-warning">⚠️ Registered after cutoff time</span>' : ''}
                    </span>
                </div>
            `;
        }
        
        // Numbers
        const numbersHtml = entry.numbers.map(n => {
            const colorClass = AdminCore.getBallColorClass(n);
            return `<span class="number-badge ${colorClass}">${String(n).padStart(2, '0')}</span>`;
        }).join('');
        
        // Recharge info
        let rechargeHtml = '<p class="text-muted">No linked recharge</p>';
        if (validation?.matchedRecharge) {
            const r = validation.matchedRecharge;
            rechargeHtml = `
                <div class="ticket-info-grid">
                    <div class="ticket-info-item">
                        <span class="label">Amount</span>
                        <span class="value">R$ ${r.amount?.toFixed(2) || '?'}</span>
                    </div>
                    <div class="ticket-info-item">
                        <span class="label">Recharge ID</span>
                        <span class="value">${r.rechargeId || '-'}</span>
                    </div>
                    <div class="ticket-info-item">
                        <span class="label">Date/Time</span>
                        <span class="value">${r.rechargeTime ? AdminCore.formatBrazilDateTime(r.rechargeTime) : '-'}</span>
                    </div>
                </div>
            `;
        }
        
        modalContent.innerHTML = `
            ${statusHtml}
            
            <h4 class="mb-3">Ticket Information</h4>
            <div class="ticket-info-grid mb-4">
                <div class="ticket-info-item">
                    <span class="label">Ticket #</span>
                    <span class="value">${entry.ticketNumber}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Game ID</span>
                    <span class="value">${entry.gameId}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">WhatsApp</span>
                    <span class="value">${entry.whatsapp || '-'}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Platform</span>
                    <span class="value">${entry.platform}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Contest</span>
                    <span class="value">${entry.contest}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Draw Date</span>
                    <span class="value">${entry.drawDate}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Registered</span>
                    <span class="value">${entry.parsedDate ? AdminCore.formatBrazilDateTime(entry.parsedDate) : entry.timestamp}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Original Status</span>
                    <span class="value">${entry.status}</span>
                </div>
            </div>
            
            <h4 class="mb-3">Selected Numbers</h4>
            <div class="numbers-display mb-4">
                ${numbersHtml}
            </div>
            
            <h4 class="mb-3">Linked Recharge</h4>
            ${rechargeHtml}
        `;
        
        AdminCore.openModal('ticketModal');
    }

    // ============================================
    // Export Functions
    // ============================================
    
    function exportCSV() {
        const data = filteredEntries;
        if (data.length === 0) {
            AdminCore.showToast('No data to export', 'warning');
            return;
        }
        
        // Build CSV
        const headers = [
            'Status',
            'Date/Time',
            'Platform',
            'Game ID',
            'WhatsApp',
            'Numbers',
            'Draw Date',
            'Contest',
            'Ticket #',
            'Original Status'
        ];
        
        // Get validation map
        const validationMap = new Map();
        if (currentData.validationResults) {
            currentData.validationResults.results.forEach(v => {
                validationMap.set(v.ticket.ticketNumber, v);
            });
        }
        
        const rows = data.map(entry => {
            const validation = validationMap.get(entry.ticketNumber);
            const status = validation?.status || 'UNKNOWN';
            
            return [
                status,
                entry.timestamp,
                entry.platform,
                entry.gameId,
                entry.whatsapp,
                entry.numbers.join(', '),
                entry.drawDate,
                entry.contest,
                entry.ticketNumber,
                entry.status
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        
        const csv = [headers.join(','), ...rows].join('\n');
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entries_${AdminCore.getBrazilDateString(new Date())}.csv`;
        link.click();
        
        AdminCore.showToast(`${data.length} entries exported`, 'success');
    }

    // ============================================
    // Page Navigation
    // ============================================
    
    function goToPage(page) {
        currentPage = page;
        renderTable();
        renderPagination();
    }

    function nextPage() {
        const totalPages = Math.ceil(filteredEntries.length / perPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            renderPagination();
        }
    }

    function prevPage() {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
            renderPagination();
        }
    }

    function changePerPage(value) {
        perPage = parseInt(value, 10);
        currentPage = 1;
        renderTable();
        renderPagination();
    }

    // ============================================
    // Data Loading
    // ============================================
    
    async function loadData() {
        try {
            const [entries, recharges] = await Promise.all([
                DataFetcher.fetchEntries(),
                DataFetcher.fetchRecharges()
            ]);
            
            // Validate all tickets
            const validationResults = await RechargeValidator.validateAllTickets(entries, recharges);
            
            currentData = { entries, recharges, validationResults };
            filteredEntries = [...entries];
            
            renderStats();
            renderValidationBanner();
            renderFilterOptions();
            applyFilters();
            
        } catch (error) {
            console.error('Error loading entries data:', error);
            AdminCore.showToast('Error loading entries', 'error');
        }
    }

    // ============================================
    // Event Handlers
    // ============================================
    
    // Debounced filter function for text inputs (300ms delay)
    const debouncedApplyFilters = AdminCore.debounce(applyFilters, 300);
    
    function bindEvents() {
        // Filter inputs with debouncing for text fields
        document.getElementById('filterGameId')?.addEventListener('input', (e) => {
            filters.gameId = e.target.value;
            debouncedApplyFilters();
        });
        
        document.getElementById('filterWhatsapp')?.addEventListener('input', (e) => {
            filters.whatsapp = e.target.value;
            debouncedApplyFilters();
        });
        
        // Dropdown filters apply immediately
        document.getElementById('filterContest')?.addEventListener('change', (e) => {
            filters.contest = e.target.value;
            applyFilters();
        });
        
        document.getElementById('filterDrawDate')?.addEventListener('change', (e) => {
            filters.drawDate = e.target.value;
            applyFilters();
        });
        
        document.getElementById('filterValidity')?.addEventListener('change', (e) => {
            filters.validity = e.target.value;
            applyFilters();
        });
        
        document.getElementById('filterCutoff')?.addEventListener('change', (e) => {
            filters.cutoff = e.target.value;
            applyFilters();
        });
        
        // Clear filters
        document.getElementById('btnClearFilters')?.addEventListener('click', clearFilters);
        
        // Export
        document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
        
        // Pagination
        document.getElementById('btnPrevPage')?.addEventListener('click', prevPage);
        document.getElementById('btnNextPage')?.addEventListener('click', nextPage);
        document.getElementById('perPageSelect')?.addEventListener('change', (e) => {
            changePerPage(e.target.value);
        });
    }

    // ============================================
    // Initialization
    // ============================================
    
    function init() {
        const container = document.getElementById('page-entries');
        if (!container) return;
        
        container.innerHTML = getTemplate();
        bindEvents();
        loadData();
        
        isInitialized = true;
    }

    function refresh() {
        if (isInitialized) {
            loadData();
        }
    }

    // Listen for page changes
    if (typeof AdminCore !== 'undefined') {
        AdminCore.on('pageChange', ({ page }) => {
            if (page === 'entries') {
                if (!isInitialized) {
                    init();
                } else {
                    refresh();
                }
            }
        });
        
        AdminCore.on('refresh', () => {
            if (AdminCore.getCurrentPage() === 'entries') {
                refresh();
            }
        });
    }

    // ============================================
    // Public API
    // ============================================
    return {
        init,
        refresh,
        loadData,
        showDetails,
        goToPage,
        exportCSV
    };
})();
