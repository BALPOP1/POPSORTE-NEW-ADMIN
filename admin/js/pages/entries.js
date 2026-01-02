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
    let cachedValidationMap = null; // Cache validation map
    let isFiltering = false; // Prevent concurrent filtering
    let virtualTable = null; // Virtual scroll instance

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

                <!-- Entries Table with Virtual Scrolling -->
                <div class="card">
                    <!-- Table Header (Fixed) -->
                    <div class="table-header-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th style="width: 140px;">Status</th>
                                    <th style="width: 110px;">Date/Time</th>
                                    <th style="width: 80px;">Platform</th>
                                    <th style="width: 100px;">Game ID</th>
                                    <th style="width: 100px;">WhatsApp</th>
                                    <th style="width: 180px;">Numbers</th>
                                    <th style="width: 90px;">Draw</th>
                                    <th style="width: 70px;">Contest</th>
                                    <th style="width: 70px;">Ticket #</th>
                                    <th style="width: 70px;">Recharge</th>
                                    <th style="width: 70px;">Actions</th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                    
                    <!-- Virtual Scroll Container -->
                    <div id="entriesVirtualContainer" class="entries-virtual-container">
                        <div class="page-loading">
                            <div class="spinner"></div>
                            <p>Loading entries...</p>
                        </div>
                    </div>
                    
                    <!-- Row Count Info -->
                    <div class="virtual-scroll-info">
                        <span id="entriesCount">0 entries</span>
                        <span id="scrollHint">Scroll to view more</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // Filter Functions
    // ============================================
    
    // Async filtering with batching to prevent UI blocking
    async function applyFilters() {
        // Prevent concurrent filtering
        if (isFiltering) {
            return;
        }
        isFiltering = true;
        
        try {
            let result = [...currentData.entries];
            
            // Build validation map once (cached)
            const validationMap = buildValidationMap();
            
            // Apply simple filters first (fast)
            if (filters.gameId) {
                const term = filters.gameId.toLowerCase();
                result = result.filter(e => e.gameId.toLowerCase().includes(term));
            }
            
            if (filters.whatsapp) {
                const term = filters.whatsapp.toLowerCase();
                result = result.filter(e => (e.whatsapp || '').toLowerCase().includes(term));
            }
            
            if (filters.contest) {
                result = result.filter(e => e.contest === filters.contest);
            }
            
            if (filters.drawDate) {
                result = result.filter(e => e.drawDate === filters.drawDate);
            }
            
            // Apply validation-based filters with batching (slower, needs to be async)
            if (filters.validity !== 'all') {
                const batchSize = 500;
                const filtered = [];
                
                for (let i = 0; i < result.length; i += batchSize) {
                    const batch = result.slice(i, i + batchSize);
                    const batchFiltered = batch.filter(e => {
                        const validation = findValidationForEntry(e, validationMap);
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
                    
                    filtered.push(...batchFiltered);
                    
                    // Yield to UI after each batch
                    if (i + batchSize < result.length) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                
                result = filtered;
            }
            
            // Apply cutoff filter with batching
            if (filters.cutoff !== 'all') {
                const batchSize = 500;
                const filtered = [];
                
                for (let i = 0; i < result.length; i += batchSize) {
                    const batch = result.slice(i, i + batchSize);
                    const batchFiltered = batch.filter(e => {
                        const validation = findValidationForEntry(e, validationMap);
                        const isCutoff = validation?.isCutoff || false;
                        return filters.cutoff === 'yes' ? isCutoff : !isCutoff;
                    });
                    
                    filtered.push(...batchFiltered);
                    
                    // Yield to UI after each batch
                    if (i + batchSize < result.length) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                
                result = filtered;
            }
            
            filteredEntries = result;
            currentPage = 1;
            renderTable();
        } finally {
            isFiltering = false;
        }
    }

    async function clearFilters() {
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
        
        await applyFilters();
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

    // Build validation map - simple approach: match by ticketNumber only
    function buildValidationMap() {
        // Return cached map if validation results haven't changed
        if (cachedValidationMap && currentData.validationResults) {
            return cachedValidationMap;
        }
        
        const map = new Map();
        if (!currentData.validationResults) {
            cachedValidationMap = map;
            return map;
        }
        
        // Simple mapping: ticketNumber -> validation result
        currentData.validationResults.results.forEach(v => {
            const ticketNumber = v.ticket?.ticketNumber;
            if (ticketNumber) {
                map.set(ticketNumber, v);
            }
        });
        
        cachedValidationMap = map;
        return map;
    }
    
    // Clear validation map cache when data changes
    function clearValidationMapCache() {
        cachedValidationMap = null;
    }
    
    // Helper function to find validation for an entry - simple lookup by ticketNumber
    function findValidationForEntry(entry, validationMap) {
        if (!validationMap || !entry.ticketNumber) return null;
        return validationMap.get(entry.ticketNumber) || null;
    }
    
    /**
     * Render a single row for virtual scrolling
     * @param {Object} entry - Entry data
     * @param {number} index - Row index
     * @returns {string} Row HTML
     */
    function renderRowHtml(entry, index) {
        const validationMap = buildValidationMap();
        const validation = findValidationForEntry(entry, validationMap);
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
            <tr data-index="${index}" data-ticket="${entry.ticketNumber}">
                <td style="width: 140px;">${statusBadge}</td>
                <td style="width: 110px; font-size: 0.8rem; white-space: nowrap;">${formattedTime}</td>
                <td style="width: 80px;"><span class="badge badge-info">${entry.platform}</span></td>
                <td style="width: 100px;"><strong>${entry.gameId}</strong></td>
                <td style="width: 100px;">${AdminCore.maskWhatsApp(entry.whatsapp)}</td>
                <td style="width: 180px;"><div class="numbers-display">${numbersHtml}</div></td>
                <td style="width: 90px;">${entry.drawDate}</td>
                <td style="width: 70px;">${entry.contest}</td>
                <td style="width: 70px; font-size: 0.75rem;">${entry.ticketNumber}</td>
                <td style="width: 70px;">${rechargeInfo}</td>
                <td style="width: 70px;">
                    <button class="btn btn-sm btn-outline" onclick="EntriesPage.showDetails('${entry.ticketNumber}')">
                        Details
                    </button>
                </td>
            </tr>
        `;
    }

    /**
     * Initialize or update virtual table with current filtered data
     */
    function renderTable() {
        const container = document.getElementById('entriesVirtualContainer');
        if (!container) return;
        
        // Update count display
        const countEl = document.getElementById('entriesCount');
        if (countEl) {
            countEl.textContent = `${filteredEntries.length.toLocaleString()} entries`;
        }
        
        // Create or update virtual table
        if (!virtualTable) {
            virtualTable = VirtualScroll.create({
                container: container,
                data: filteredEntries,
                rowHeight: 48,
                renderRow: renderRowHtml,
                emptyMessage: 'No entries found matching your filters'
            });
        } else {
            virtualTable.setData(filteredEntries);
        }
        
        // Update scroll hint visibility
        const hintEl = document.getElementById('scrollHint');
        if (hintEl) {
            hintEl.style.display = filteredEntries.length > 10 ? 'inline' : 'none';
        }
    }

    /**
     * Legacy function for backward compatibility
     */
    function renderPagination() {
        // No longer needed with virtual scrolling
    }

    // ============================================
    // Modal Functions
    // ============================================
    
    function showDetails(ticketNumber) {
        const entry = currentData.entries.find(e => e.ticketNumber === ticketNumber);
        if (!entry) return;
        
        // Get validation using the shared helper
        const validationMap = buildValidationMap();
        const validation = findValidationForEntry(entry, validationMap);
        
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
        
        // Build validation map once
        const validationMap = buildValidationMap();
        
        const rows = data.map(entry => {
            const validation = findValidationForEntry(entry, validationMap);
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
            // Fetch data in parallel for faster loading
            const [entriesResult, rechargesResult] = await Promise.allSettled([
                DataFetcher.fetchEntries(),
                DataFetcher.fetchRecharges()
            ]);
            
            const entries = entriesResult.status === 'fulfilled' ? entriesResult.value : [];
            const recharges = rechargesResult.status === 'fulfilled' ? rechargesResult.value : [];
            
            if (rechargesResult.status === 'rejected') {
                console.warn('Could not fetch recharges:', rechargesResult.reason);
            }
            
            // Validate all tickets (uses caching internally)
            const validationResults = await RechargeValidator.validateAllTickets(entries, recharges);
            
            currentData = { entries, recharges, validationResults };
            filteredEntries = [...entries];
            
            // Clear validation map cache when data changes
            clearValidationMapCache();
            
            renderStats();
            renderValidationBanner();
            renderFilterOptions();
            await applyFilters();
            
        } catch (error) {
            console.error('Error loading entries data:', error);
            AdminCore.showToast('Error loading entries: ' + error.message, 'error');
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
        
        // Load data asynchronously - don't block initialization
        loadData().catch(error => {
            console.error('Error loading entries data:', error);
            AdminCore.showToast('Error loading entries: ' + error.message, 'error');
        });
        
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
                }
                // Don't auto-refresh when returning to page - wait for manual refresh or timer
            }
        });
        
        // Only refresh on explicit refresh action
        AdminCore.on('refresh', () => {
            if (AdminCore.getCurrentPage() === 'entries' && isInitialized) {
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
