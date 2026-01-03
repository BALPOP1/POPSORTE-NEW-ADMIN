/**
 * POP-SORTE Admin Dashboard - Unified Page Module
 * 
 * This module combines Dashboard, Entries, Results, and Winners into a single
 * scrollable page. All sections load together and sidebar navigation scrolls
 * to the appropriate section.
 * 
 * Features:
 * - Single-page layout with scroll navigation
 * - Platform filtering (ALL, POPN1, POPLUZ)
 * - Unified data loading
 * - Real-time updates
 * 
 * Dependencies: AdminCore, DataStore, DataFetcher, ResultsFetcher, 
 *               RechargeValidator, WinnerCalculator, AdminCharts
 */

window.UnifiedPage = (function() {
    'use strict';

    // ============================================
    // State
    // ============================================
    let isInitialized = false;
    let currentData = {
        entries: [],
        allEntries: [],
        recharges: [],      // Platform-filtered recharges
        allRecharges: [],   // All recharges (for validation)
        results: [],
        validationResults: null
    };
    
    // Entries pagination state
    let filteredEntries = [];
    let entriesPage = 1;
    let entriesPerPage = 25;
    let entriesFilters = {
        gameId: '',
        whatsapp: '',
        contest: '',
        validity: 'all'
    };
    let sortColumn = 'registrationDateTime'; // Default sort column
    let sortDirection = 'desc'; // Default: descending (newest first)
    
    // Results state
    let filteredResults = [];
    let resultsSearchTerm = '';
    
    // Winners state
    let allWinners = [];
    let filteredWinners = [];
    let winnersCalculation = null;
    let winnersFilters = {
        contest: '',
        prizeLevel: 'all'
    };

    // Validation cache
    let validationMap = new Map();

    // ============================================
    // DASHBOARD SECTION
    // ============================================
    
    function renderDashboard() {
        const { entries, allEntries, recharges, results } = currentData;
        const platform = AdminCore.getCurrentPlatform();
        
        // Platform label
        const platformLabel = document.getElementById('platformStatsLabel');
        if (platformLabel) {
            platformLabel.textContent = platform === 'ALL' ? 'All Platforms' : platform;
            platformLabel.className = `badge badge-${platform === 'ALL' ? 'info' : platform === 'POPN1' ? 'primary' : 'warning'}`;
        }
        
        // Platform breakdown visibility
        const breakdownEl = document.getElementById('platformBreakdown');
        if (breakdownEl) {
            breakdownEl.style.display = platform === 'ALL' ? 'grid' : 'none';
        }
        
        // Stats
        document.getElementById('statTotalTickets').textContent = entries.length.toLocaleString();
        
        const contests = new Set(entries.map(e => e.contest).filter(Boolean));
        document.getElementById('statTotalContests').textContent = contests.size.toLocaleString();
        
        const drawDates = new Set(entries.map(e => e.drawDate).filter(Boolean));
        document.getElementById('statDrawDates').textContent = drawDates.size.toLocaleString();
        
        const pending = entries.filter(e => {
            const status = (e.status || '').toUpperCase();
            return !['VALID', 'VALIDADO', 'INVALID', 'INVÁLIDO'].includes(status);
        });
        document.getElementById('statPending').textContent = pending.length.toLocaleString();
        
        // Platform breakdown
        if (platform === 'ALL' && allEntries.length > 0) {
            const breakdown = DataStore.getEntriesByPlatform(allEntries);
            document.getElementById('statPOPN1Tickets').textContent = breakdown.POPN1.count.toLocaleString() + ' tickets';
            document.getElementById('statPOPLUZTickets').textContent = breakdown.POPLUZ.count.toLocaleString() + ' tickets';
        }
        
        // Engagement
        renderEngagement();
        
        // Charts
        renderCharts();
        
        // Recharge vs Tickets table
        renderRechargeTable();
        
        // Top Entrants
        renderTopEntrants();
        
        // Latest Entries
        renderLatestEntries();
        
        // Winners stats (async)
        renderWinnersStats();
    }

    function renderEngagement() {
        const { entries, recharges } = currentData;
        
        if (!recharges || recharges.length === 0) {
            const uniqueCreators = new Set(entries.map(e => e.gameId).filter(Boolean));
            document.getElementById('statRechargers').textContent = '-';
            document.getElementById('statParticipants').textContent = uniqueCreators.size.toLocaleString();
            document.getElementById('statNoTicket').textContent = '-';
            document.getElementById('statParticipationRate').textContent = '-';
        } else {
            const engagement = RechargeValidator.analyzeEngagement(entries, recharges);
            document.getElementById('statRechargers').textContent = engagement.totalRechargers.toLocaleString();
            document.getElementById('statParticipants').textContent = engagement.totalParticipants.toLocaleString();
            document.getElementById('statNoTicket').textContent = engagement.rechargedNoTicket.toLocaleString();
            document.getElementById('statParticipationRate').textContent = `${engagement.participationRate}%`;
        }
    }

    function renderCharts() {
        const { entries, recharges } = currentData;
        
        // 7-day ticket creators chart
        const dailyCreators = WinnerCalculator.getTicketCreatorsByDay(entries, 7);
        const canvas1 = document.getElementById('chartTicketCreators7Day');
        if (canvas1) {
            AdminCharts.createTicketCreators7DayChart(canvas1, dailyCreators);
        }
        
        // Last 7 days chart
        const dailyData = RechargeValidator.analyzeEngagementByDate(entries, recharges, 7);
        const canvas2 = document.getElementById('chartLast7Days');
        if (canvas2) {
            const metric = document.getElementById('chartMetricSelect')?.value || 'all';
            AdminCharts.createLast7DaysChart(canvas2, dailyData, metric);
        }
    }

    function renderRechargeTable() {
        const { entries, recharges } = currentData;
        const dailyData = RechargeValidator.analyzeEngagementByDate(entries, recharges, 7);
        
        const tbody = document.getElementById('rechargeVsTicketsBody');
        if (!tbody) return;
        
        if (dailyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No data</td></tr>';
            return;
        }
        
        const hasRechargeData = recharges && recharges.length > 0;
        
        tbody.innerHTML = dailyData.map(day => `
            <tr>
                <td><strong>${day.displayDate}</strong></td>
                <td>${hasRechargeData ? day.totalRechargers : '-'}</td>
                <td>${hasRechargeData ? day.totalParticipants : '-'}</td>
                <td class="text-warning">${hasRechargeData ? day.rechargedNoTicket : '-'}</td>
                <td class="text-success">${hasRechargeData ? day.participationRate + '%' : '-'}</td>
                <td><strong>${day.totalEntries}</strong></td>
            </tr>
        `).join('');
    }

    function renderTopEntrants() {
        const { entries } = currentData;
        const topEntrants = DataFetcher.getTopEntrants(entries, 10);
        
        const tbody = document.getElementById('topEntrantsBody');
        if (!tbody) return;
        
        if (topEntrants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No data</td></tr>';
            return;
        }
        
        tbody.innerHTML = topEntrants.map((entrant, index) => `
            <tr>
                <td><span class="badge badge-${index < 3 ? 'warning' : 'info'}">${index + 1}</span></td>
                <td><strong>${entrant.gameId}</strong></td>
                <td>${AdminCore.maskWhatsApp(entrant.whatsapp)}</td>
                <td>${entrant.count.toLocaleString()}</td>
            </tr>
        `).join('');
    }

    function renderLatestEntries() {
        const { entries } = currentData;
        const latest = entries.slice(0, 10);
        
        const tbody = document.getElementById('latestEntriesContainer');
        if (!tbody) return;
        
        if (latest.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No entries</td></tr>';
            return;
        }
        
        tbody.innerHTML = latest.map(entry => {
            const time = entry.parsedDate
                ? AdminCore.formatBrazilDateTime(entry.parsedDate, { hour: '2-digit', minute: '2-digit' })
                : '--:--';
            
            const numbersHtml = entry.numbers.slice(0, 5).map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:22px;height:22px;font-size:0.6rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            const platform = (entry.platform || 'POPN1').toUpperCase();
            const platformClass = platform === 'POPLUZ' ? 'popluz' : 'popn1';
            
            return `
                <tr>
                    <td style="font-size:0.85rem">${time}</td>
                    <td><strong>${entry.gameId}</strong></td>
                    <td><span class="platform-badge ${platformClass}">${platform}</span></td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td>${entry.contest}</td>
                </tr>
            `;
        }).join('');
    }

    async function renderWinnersStats() {
        try {
            const { entries, results } = currentData;
            const platform = AdminCore.getCurrentPlatform();
            const winnerStats = await WinnerCalculator.getWinnerStats(entries, results, platform);
            
            document.getElementById('statTotalWinners').textContent = winnerStats.totalWinners.toLocaleString();
            document.getElementById('statWinRate').textContent = `${winnerStats.winRate}%`;
        } catch (error) {
            console.error('Error rendering winners stats:', error);
        }
    }

    // ============================================
    // ENTRIES SECTION
    // ============================================
    
    async function renderEntries() {
        const { entries, recharges, allRecharges, validationResults } = currentData;
        
        // Debug: Check data availability
        console.log('renderEntries: entries=', entries.length, 'recharges=', recharges.length, 'allRecharges=', allRecharges.length);
        console.log('renderEntries: validationResults=', validationResults ? 'available' : 'MISSING');
        
        if (validationResults && entries.length > 0) {
            const sampleEntry = entries[0];
            console.log('renderEntries: Sample entry:', {
                ticketNumber: sampleEntry.ticketNumber,
                gameId: sampleEntry.gameId,
                hasBoundRecharge: !!sampleEntry.boundRecharge
            });
        }
        
        // Stats - Count from validated entries (will be updated after validation)
        let validCount = 0;
        let invalidCount = 0;
        let cutoffCount = 0;
        
        // Check if entries are already validated
        if (entries.length > 0 && entries[0].validity) {
            validCount = entries.filter(e => e.validity === 'VALID').length;
            invalidCount = entries.filter(e => e.validity === 'INVALID').length;
            cutoffCount = entries.filter(e => e.cutoffFlag).length;
        }
        
        document.getElementById('statValid').textContent = validCount.toLocaleString();
        document.getElementById('statInvalid').textContent = invalidCount.toLocaleString();
        document.getElementById('statCutoff').textContent = cutoffCount.toLocaleString();
        
        // Show platform-filtered recharge count
        document.getElementById('statRechargesCount').textContent = recharges.length.toLocaleString();
        
        // Validation banner
        const banner = document.getElementById('validationBanner');
        const platform = AdminCore.getCurrentPlatform();
        if (banner) {
            if (allRecharges.length === 0) {
                banner.className = 'status-banner warning';
                banner.innerHTML = '<span class="status-banner-icon">⚠️</span><span class="status-banner-text">Recharge data not loaded.</span>';
            } else if (validationResults) {
                banner.className = 'status-banner success';
                const platformNote = platform === 'ALL' ? '' : ` (${recharges.length} for ${platform})`;
                banner.innerHTML = `<span class="status-banner-icon">✅</span><span class="status-banner-text">Validation complete. ${allRecharges.length} total recharges${platformNote}.</span>`;
            }
        }
        
        // Build validation map (NOTE: This map may have issues with duplicate ticket numbers)
        // The table rendering now uses direct validation result matching instead
        validationMap.clear();
        if (validationResults) {
            let validCount = 0;
            let invalidCount = 0;
            validationResults.results.forEach(v => {
                if (v.ticket?.ticketNumber) {
                    validationMap.set(v.ticket.ticketNumber, v);
                }
                if (v.status === 'VALID') validCount++;
                if (v.status === 'INVALID') invalidCount++;
            });
            console.log(`Validation map built: ${validationMap.size} unique ticket numbers (${validCount} valid, ${invalidCount} invalid)`);
        }
        
        // Populate filter options
        const contests = [...new Set(entries.map(e => e.contest).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
        const contestSelect = document.getElementById('filterContest');
        if (contestSelect) {
            contestSelect.innerHTML = '<option value="">All</option>' + contests.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        
        // Apply filters
        applyEntriesFilters();
    }

    function applyEntriesFilters() {
        let result = [...currentData.entries];
        
        // Validate entries using RechargeValidator
        if (currentData.allRecharges && currentData.allRecharges.length > 0) {
            result = RechargeValidator.validateEntries(result);
        } else {
            // No recharge data - mark all as UNKNOWN
            result = result.map(e => ({
                ...e,
                validity: 'UNKNOWN',
                invalidReasonCode: 'NO_RECHARGE_DATA',
                boundRechargeId: null,
                boundRechargeTime: null,
                boundRechargeAmount: null,
                cutoffFlag: false
            }));
        }
        
        // Apply filters
        if (entriesFilters.gameId) {
            const term = entriesFilters.gameId.toLowerCase();
            result = result.filter(e => e.gameId.toLowerCase().includes(term));
        }
        if (entriesFilters.whatsapp) {
            const term = entriesFilters.whatsapp.toLowerCase();
            result = result.filter(e => (e.whatsapp || '').toLowerCase().includes(term));
        }
        if (entriesFilters.contest) {
            result = result.filter(e => e.contest === entriesFilters.contest);
        }
        if (entriesFilters.validity !== 'all') {
            result = result.filter(e => e.validity === entriesFilters.validity.toUpperCase());
        }
        
        // Apply column-based sorting
        sortEntries(result);
        
        filteredEntries = result;
        entriesPage = 1;
        renderEntriesTable();
        renderEntriesPagination();
        
        // Update stats after validation
        updateValidationStats(result);
    }
    
    function sortEntries(entries) {
        entries.sort((a, b) => {
            let aVal = a[sortColumn];
            let bVal = b[sortColumn];
            
            // Special handling for different column types
            if (sortColumn === 'chosenNumbers') {
                aVal = a.numbers ? a.numbers.join(',') : '';
                bVal = b.numbers ? b.numbers.join(',') : '';
            } else if (sortColumn === 'registrationDateTime') {
                aVal = a.parsedDate?.getTime() || 0;
                bVal = b.parsedDate?.getTime() || 0;
            } else if (sortColumn === 'validity') {
                const order = { 'VALID': 2, 'INVALID': 1, 'UNKNOWN': 0 };
                aVal = order[a.validity] || 0;
                bVal = order[b.validity] || 0;
            }
            
            // Handle null/undefined
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';
            
            // Compare
            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    function updateValidationStats(validatedEntries) {
        const validCount = validatedEntries.filter(e => e.validity === 'VALID').length;
        const invalidCount = validatedEntries.filter(e => e.validity === 'INVALID').length;
        const cutoffCount = validatedEntries.filter(e => e.cutoffFlag).length;
        
        document.getElementById('statValid').textContent = validCount.toLocaleString();
        document.getElementById('statInvalid').textContent = invalidCount.toLocaleString();
        document.getElementById('statCutoff').textContent = cutoffCount.toLocaleString();
    }

    function renderEntriesTable() {
        const tbody = document.getElementById('entriesTableBody');
        if (!tbody) {
            console.error('❌ entriesTableBody element not found!');
            return;
        }
        
        tbody.innerHTML = '';
        const start = (entriesPage - 1) * entriesPerPage;
        const pageEntries = filteredEntries.slice(start, start + entriesPerPage);
        
        if (pageEntries.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="11" class="text-center text-muted">No entries found</td>';
            return;
        }
        
        pageEntries.forEach(e => {
            const row = tbody.insertRow();
            
            // Validity badge
            let valBadge = e.validity === 'VALID' 
                ? '<span class="badge badge-success">✅ VALID</span>' 
                : (e.validity === 'INVALID' 
                    ? '<span class="badge badge-danger">❌ INVALID</span>' 
                    : '<span class="badge" style="background:#6c757d;color:white;">❓ UNKNOWN</span>');
            
            if (e.cutoffFlag) {
                valBadge += ' <span class="badge badge-warning">⚠️ CUTOFF</span>';
            }
            
            // Recharge info
            const recInfo = e.boundRechargeId 
                ? `<div style="font-size:11px;"><strong>ID:</strong> ${e.boundRechargeId.substring(0,16)}...<br><strong>Time:</strong> ${e.boundRechargeTime}<br><strong>Amount:</strong> R$ ${e.boundRechargeAmount}</div>` 
                : '<span style="color:#999;font-size:11px;">No recharge bound</span>';
            
            // Format numbers
            const numbersHtml = e.numbers.slice(0, 5).map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:24px;height:24px;font-size:0.6rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            const formattedTime = e.parsedDate
                ? AdminCore.formatBrazilDateTime(e.parsedDate, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                : e.timestamp;
            
            const whatsappDisplay = AdminCore.maskWhatsApp(e.whatsapp);
            const platform = (e.platform || 'POPN1').toUpperCase();
            
            row.innerHTML = `
                <td>${valBadge}</td>
                <td style="font-size:0.8rem;white-space:nowrap">${formattedTime}</td>
                <td><span class="platform-badge ${platform.toLowerCase()}">${platform}</span></td>
                <td><strong>${e.gameId}</strong></td>
                <td style="font-size:0.75rem">${whatsappDisplay}</td>
                <td><div class="numbers-display">${numbersHtml}</div></td>
                <td style="font-size:0.8rem">${e.drawDate || '-'}</td>
                <td><span class="badge badge-info">${e.contest}</span></td>
                <td style="font-size:0.9rem">${e.ticketNumber}</td>
                <td>${recInfo}</td>
                <td><button class="btn btn-sm btn-outline" style="padding:5px 10px;font-size:12px;" onclick='UnifiedPage.showTicketDetails(${JSON.stringify(e.ticketNumber).replace(/'/g, "&apos;")})'>🔍 Details</button></td>
            `;
        });
    }

    function renderEntriesPagination() {
        const total = filteredEntries.length;
        const totalPages = Math.ceil(total / entriesPerPage);
        const start = (entriesPage - 1) * entriesPerPage + 1;
        const end = Math.min(entriesPage * entriesPerPage, total);
        
        document.getElementById('paginationInfo').textContent = `Showing ${total > 0 ? start : 0}-${end} of ${total} entries`;
        document.getElementById('btnPrevPage').disabled = entriesPage <= 1;
        document.getElementById('btnNextPage').disabled = entriesPage >= totalPages;
        
        const pageNumbers = document.getElementById('pageNumbers');
        if (pageNumbers) {
            let html = '';
            for (let i = 1; i <= Math.min(totalPages, 5); i++) {
                html += `<button class="pagination-btn ${i === entriesPage ? 'active' : ''}" onclick="UnifiedPage.goToEntriesPage(${i})">${i}</button>`;
            }
            if (totalPages > 5) html += `<span class="text-muted">... ${totalPages}</span>`;
            pageNumbers.innerHTML = html;
        }
    }

    function goToEntriesPage(page) {
        entriesPage = page;
        renderEntriesTable();
        renderEntriesPagination();
    }

    function showTicketDetails(ticketNumber) {
        // Find entry in filtered entries (already validated)
        let entry = filteredEntries.find(e => e.ticketNumber === ticketNumber);
        
        // If not found in filtered, search in all entries and validate it
        if (!entry) {
            entry = currentData.entries.find(e => e.ticketNumber === ticketNumber);
            if (!entry) return;
            
            // Validate this single entry
            if (currentData.allRecharges && currentData.allRecharges.length > 0) {
                const validated = RechargeValidator.validateEntries([entry]);
                entry = validated[0];
            }
        }
        
        const modalContent = document.getElementById('ticketModalContent');
        if (!modalContent) return;
        
        // Validation status banner with detailed explanation (Admin style)
        let valExp = '';
        if (entry.validity === 'VALID') {
            const rechargeIdShort = entry.boundRechargeId ? entry.boundRechargeId.substring(0, 16) + '...' : 'N/A';
            valExp = `<div style="padding:15px;background:#d4edda;border-radius:8px;border-left:4px solid #28a745;margin-bottom:20px;">
                <h3 style="color:#155724;margin-bottom:10px;">✅ TICKET IS VALID</h3>
                <p style="margin:0;">This is the first ticket created after recharge <strong>${rechargeIdShort}</strong>.</p>
            </div>`;
        } else if (entry.validity === 'INVALID') {
            const reasonText = RechargeValidator.getReasonCodeText(entry.invalidReasonCode);
            const extraHelp = entry.invalidReasonCode === 'INVALID_TICKET_BEFORE_RECHARGE' 
                ? '<p style="margin-top:10px;font-size:13px;">💡 This ticket was created without a preceding recharge, or all recharges were already consumed by earlier tickets.</p>' 
                : '';
            valExp = `<div style="padding:15px;background:#f8d7da;border-radius:8px;border-left:4px solid #dc3545;margin-bottom:20px;">
                <h3 style="color:#721c24;margin-bottom:10px;">❌ TICKET IS INVALID</h3>
                <p style="margin:0;"><strong>Reason:</strong> ${reasonText}</p>
                ${extraHelp}
            </div>`;
        } else {
            valExp = `<div style="padding:15px;background:#fff3cd;border-radius:8px;border-left:4px solid #ffc107;margin-bottom:20px;">
                <h3 style="color:#856404;margin-bottom:10px;">❓ VALIDITY UNKNOWN</h3>
                <p style="margin:0;">Upload recharge data to validate this ticket.</p>
            </div>`;
        }
        
        // Cutoff warning
        const cutWarn = entry.cutoffFlag 
            ? `<div style="padding:15px;background:#fff3cd;border-radius:8px;border-left:4px solid #ffc107;margin-bottom:20px;">
                <h3 style="color:#856404;margin-bottom:10px;">⚠️ CUTOFF TIME SHIFT DETECTED</h3>
                <p style="margin:0;">Recharge happened before 20:00:00, but ticket was created after 20:00:01. This ticket belongs to tomorrow's draw.</p>
            </div>` 
            : '';
        
        // Render number badges
        const numbersHtml = entry.numbers.map(n => {
            const colorClass = AdminCore.getBallColorClass(n);
            return `<span class="number-badge ${colorClass}">${String(n).padStart(2,'0')}</span>`;
        }).join('');
        
        // Bound recharge information
        const rechargeHtml = entry.boundRechargeId 
            ? `<table style="width:100%;">
                <tr><td><strong>Recharge ID:</strong></td><td>${entry.boundRechargeId}</td></tr>
                <tr><td><strong>Recharge Time:</strong></td><td>${entry.boundRechargeTime}</td></tr>
                <tr><td><strong>Recharge Amount:</strong></td><td>R$ ${entry.boundRechargeAmount}</td></tr>
            </table>` 
            : '<p style="color:#999;font-style:italic;">No recharge data available for this ticket.</p>';
        
        modalContent.innerHTML = `
            ${valExp}
            ${cutWarn}
            
            <h3 style="margin-bottom:15px;">📋 Ticket Information</h3>
            <table style="width:100%;margin-bottom:20px;">
                <tr><td><strong>Game ID:</strong></td><td>${entry.gameId}</td></tr>
                <tr><td><strong>Platform:</strong></td><td>${entry.platform}</td></tr>
                <tr><td><strong>WhatsApp:</strong></td><td>${entry.whatsapp}</td></tr>
                <tr><td><strong>Ticket #:</strong></td><td>${entry.ticketNumber}</td></tr>
                <tr><td><strong>Registration Time:</strong></td><td>${entry.timestamp}</td></tr>
                <tr><td><strong>Contest:</strong></td><td>${entry.contest}</td></tr>
                <tr><td><strong>Draw Date:</strong></td><td>${entry.drawDate}</td></tr>
                <tr><td><strong>Chosen Numbers:</strong></td><td><strong>${entry.numbers.join(', ')}</strong></td></tr>
            </table>
            
            <h3 style="margin-bottom:15px;">💳 Bound Recharge Information</h3>
            ${rechargeHtml}
        `;
        
        AdminCore.openModal('ticketModal');
    }

    function exportEntriesCSV() {
        if (filteredEntries.length === 0) {
            AdminCore.showToast('No data to export', 'warning');
            return;
        }
        
        const headers = ['Validity', 'Registration Date/Time', 'Platform', 'Game ID', 'WhatsApp', 'Chosen Numbers', 'Draw Date', 'Contest', 'Ticket #', 'Bound Recharge ID', 'Recharge Time', 'Recharge Amount', 'Invalid Reason', 'Cutoff Flag'];
        const rows = filteredEntries.map(e => {
            return [
                e.validity || 'UNKNOWN',
                e.timestamp,
                e.platform,
                e.gameId,
                e.whatsapp,
                e.numbers.join(', '),
                e.drawDate,
                e.contest,
                e.ticketNumber,
                e.boundRechargeId || '',
                e.boundRechargeTime || '',
                e.boundRechargeAmount || '',
                e.invalidReasonCode || '',
                e.cutoffFlag ? 'YES' : 'NO'
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entries_validated_${AdminCore.getBrazilDateString(new Date())}.csv`;
        link.click();
        
        AdminCore.showToast(`${filteredEntries.length} validated entries exported`, 'success');
    }

    // ============================================
    // RESULTS SECTION
    // ============================================
    
    function renderResults() {
        const { results } = currentData;
        
        // Stats
        const total = results.length;
        const validDraws = results.filter(r => !r.isNoDraw).length;
        const noDraws = results.filter(r => r.isNoDraw).length;
        
        document.getElementById('statTotalResults').textContent = total.toLocaleString();
        document.getElementById('statValidDraws').textContent = validDraws.toLocaleString();
        document.getElementById('statNoDraws').textContent = noDraws.toLocaleString();
        
        // Latest result card
        const latest = results.find(r => !r.isNoDraw);
        const card = document.getElementById('latestResultCard');
        if (latest && card) {
            card.style.display = 'block';
            document.getElementById('latestResultContest').textContent = `Contest #${latest.contest}`;
            document.getElementById('latestResultDate').textContent = latest.drawDate;
            document.getElementById('latestResultNumbers').innerHTML = latest.numbers.map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:48px;height:48px;font-size:1.1rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
        }
        
        filteredResults = [...results];
        renderResultsTable();
    }

    function renderResultsTable() {
        const tbody = document.getElementById('resultsTableBody');
        if (!tbody) return;
        
        let data = filteredResults;
        if (resultsSearchTerm) {
            const term = resultsSearchTerm.toLowerCase();
            data = data.filter(r => r.contest.toLowerCase().includes(term) || (r.drawDate || '').toLowerCase().includes(term));
        }
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No results found</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.slice(0, 50).map(result => {
            let numbersHtml = '';
            if (result.isNoDraw) {
                numbersHtml = '<span class="badge badge-warning">No Draw</span>';
            } else {
                numbersHtml = result.numbers.map(n => {
                    const colorClass = AdminCore.getBallColorClass(n);
                    return `<span class="number-badge ${colorClass}" style="width:28px;height:28px;font-size:0.7rem">${String(n).padStart(2,'0')}</span>`;
                }).join('');
            }
            
            let sourceBadge = '<span class="badge badge-gray">Manual</span>';
            const source = (result.source || '').toLowerCase();
            if (source.includes('caixa')) sourceBadge = '<span class="badge badge-success">Caixa</span>';
            else if (source.includes('api')) sourceBadge = '<span class="badge badge-info">API</span>';
            
            return `
                <tr>
                    <td><strong>#${result.contest}</strong></td>
                    <td>${result.drawDate || '-'}</td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td>${sourceBadge}</td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // WINNERS SECTION
    // ============================================
    
    async function renderWinners() {
        const { entries, results } = currentData;
        const platform = AdminCore.getCurrentPlatform();
        
        try {
            // Calculate winners
            winnersCalculation = await WinnerCalculator.calculateAllWinners(entries, results, platform);
            allWinners = winnersCalculation.allWinners || [];
            filteredWinners = [...allWinners];
            
            const stats = winnersCalculation.stats;
            document.getElementById('stat5Matches').textContent = (stats.byTier?.[5] || 0).toLocaleString();
            document.getElementById('stat4Matches').textContent = (stats.byTier?.[4] || 0).toLocaleString();
            document.getElementById('stat3Matches').textContent = (stats.byTier?.[3] || 0).toLocaleString();
            document.getElementById('statWinnersTotal').textContent = (stats.totalWinners || 0).toLocaleString();
            
            // Prize pool label
            const prizePool = WinnerCalculator.getPrizePool(platform === 'ALL' ? 'DEFAULT' : platform);
            const prizeLabel = document.getElementById('prizePoolLabel');
            if (prizeLabel) prizeLabel.textContent = `Prize Pool: R$ ${prizePool.toLocaleString()}`;
            
            // Winners by contest cards
            renderWinnersCards();
            
            // Populate filter options
            const contests = [...new Set(allWinners.map(w => w.contest).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
            const contestSelect = document.getElementById('filterWinnersContest');
            if (contestSelect) {
                contestSelect.innerHTML = '<option value="">All</option>' + contests.map(c => `<option value="${c}">${c}</option>`).join('');
            }
            
            renderWinnersTable();
            
        } catch (error) {
            console.error('Error calculating winners:', error);
            document.getElementById('winnersTableBody').innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error calculating winners</td></tr>';
        }
    }

    function renderWinnersCards() {
        const container = document.getElementById('winnersByContestContainer');
        if (!container || !winnersCalculation) return;
        
        const contestsWithResults = winnersCalculation.contestResults.filter(c => c.hasResult).slice(0, 6);
        
        if (contestsWithResults.length === 0) {
            container.innerHTML = '<div class="card"><div class="card-body text-center text-muted">No contest results available</div></div>';
            return;
        }
        
        container.innerHTML = contestsWithResults.map(contest => {
            // Always show winning numbers if available
            const numbersHtml = contest.winningNumbers && contest.winningNumbers.length > 0
                ? contest.winningNumbers.map(n => {
                    const colorClass = AdminCore.getBallColorClass(n);
                    return `<span class="number-badge ${colorClass}">${String(n).padStart(2,'0')}</span>`;
                }).join('')
                : '<span class="text-muted">Winning numbers not available</span>';
            
            const tierCounts = [];
            for (let tier = 5; tier >= 3; tier--) {
                const count = contest.byTier[tier]?.filter(w => w.isValidEntry).length || 0;
                if (count > 0) {
                    const emoji = tier === 5 ? '🏆' : tier === 4 ? '🥈' : '🥉';
                    tierCounts.push(`<span class="badge badge-${tier === 5 ? 'warning' : tier === 4 ? 'info' : 'success'}">${emoji} ${tier}: ${count}</span>`);
                }
            }
            
            let prizeInfo = '';
            if (contest.winningTier > 0 && contest.prizePerWinner > 0) {
                const winnerCount = contest.byTier[contest.winningTier]?.filter(w => w.isValidEntry).length || 0;
                prizeInfo = `<div class="text-success mt-2" style="font-size:0.8rem">💰 R$ ${contest.prizePerWinner.toFixed(2)} per winner</div>`;
            }
            
            return `
                <div class="card">
                    <div class="card-header">
                        <strong>Contest #${contest.contest}</strong>
                        <span class="text-muted">${contest.drawDate}</span>
                    </div>
                    <div class="card-body">
                        <div class="numbers-display mb-2" style="justify-content:center">${numbersHtml}</div>
                        <div class="text-center">
                            ${tierCounts.length > 0 ? tierCounts.join(' ') : '<span class="text-muted">No winners</span>'}
                            ${prizeInfo}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function applyWinnersFilters() {
        let result = [...allWinners];
        
        if (winnersFilters.contest) {
            result = result.filter(w => w.contest === winnersFilters.contest);
        }
        if (winnersFilters.prizeLevel !== 'all') {
            const level = parseInt(winnersFilters.prizeLevel);
            result = result.filter(w => w.matches === level);
        }
        
        filteredWinners = result;
        renderWinnersTable();
    }

    function renderWinnersTable() {
        const tbody = document.getElementById('winnersTableBody');
        if (!tbody) return;
        
        if (filteredWinners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No winners found</td></tr>';
            return;
        }
        
        const displayWinners = filteredWinners.slice(0, 100);
        
        tbody.innerHTML = displayWinners.map(winner => {
            let matchBadge = '';
            switch (winner.matches) {
                case 5: matchBadge = '<span class="badge" style="background:#fbbf24;color:#000">🏆 5</span>'; break;
                case 4: matchBadge = '<span class="badge" style="background:#9ca3af;color:#000">🥈 4</span>'; break;
                case 3: matchBadge = '<span class="badge" style="background:#d97706;color:#fff">🥉 3</span>'; break;
                default: matchBadge = `<span class="badge badge-info">${winner.matches}</span>`;
            }
            
            const matchedSet = new Set(winner.matchedNumbers || []);
            const numbersHtml = winner.numbers.map(n => {
                const isMatched = matchedSet.has(n);
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass} ${isMatched ? 'match' : ''}" style="width:22px;height:22px;font-size:0.6rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            const matchedHtml = (winner.matchedNumbers || []).map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:22px;height:22px;font-size:0.6rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            return `
                <tr>
                    <td>${matchBadge}</td>
                    <td><strong>${winner.gameId}</strong></td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td><div class="numbers-display">${matchedHtml}</div></td>
                    <td>${winner.contest}</td>
                    <td>${winner.drawDate}</td>
                </tr>
            `;
        }).join('');
        
        if (filteredWinners.length > 100) {
            tbody.innerHTML += `<tr><td colspan="6" class="text-center text-muted">Showing 100 of ${filteredWinners.length} winners</td></tr>`;
        }
    }

    function exportWinnersCSV() {
        if (filteredWinners.length === 0) {
            AdminCore.showToast('No winners to export', 'warning');
            return;
        }
        
        const headers = ['Matches', 'Game ID', 'Numbers', 'Matched Numbers', 'Draw Date', 'Contest'];
        const rows = filteredWinners.map(w => [
            w.matches,
            w.gameId,
            w.numbers.join(', '),
            (w.matchedNumbers || []).join(', '),
            w.drawDate,
            w.contest
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `winners_${AdminCore.getBrazilDateString(new Date())}.csv`;
        link.click();
        
        AdminCore.showToast(`${filteredWinners.length} winners exported`, 'success');
    }

    // ============================================
    // DATA LOADING
    // ============================================
    
    async function loadAllData(forceRefresh = false) {
        console.log('UnifiedPage: Loading all data...');
        
        try {
            await DataStore.loadData(forceRefresh);
            
            const platform = AdminCore.getCurrentPlatform();
            
            // Get platform-filtered data
            currentData.entries = DataStore.getEntries(platform);
            currentData.allEntries = DataStore.getAllEntries();
            // IMPORTANT: Get platform-filtered recharges (only recharges for users in this platform)
            currentData.recharges = DataStore.getRecharges(platform);
            currentData.allRecharges = DataStore.getAllRecharges(); // For validation across all platforms
            currentData.results = DataStore.getResults();
            
            // Validate only the platform-filtered entries (using ALL recharges for validation lookup)
            // Skip cache when platform is not ALL, since cached results are for all entries
            const skipCache = platform !== 'ALL';
            currentData.validationResults = await RechargeValidator.validateAllTickets(currentData.entries, currentData.allRecharges, skipCache);
            
            console.log('UnifiedPage: Data loaded -', currentData.entries.length, 'entries,', currentData.recharges.length, 'recharges for platform:', platform);
            console.log('UnifiedPage: Total recharges (all platforms):', currentData.allRecharges.length);
            console.log('UnifiedPage: Validation results:', currentData.validationResults);
            
            // Debug: Check first few validation results
            if (currentData.validationResults && currentData.validationResults.results) {
                const sampleResults = currentData.validationResults.results.slice(0, 5);
                console.log('UnifiedPage: Sample validation results:', sampleResults.map(v => ({
                    ticket: v.ticket?.ticketNumber,
                    status: v.status,
                    hasRecharge: !!v.matchedRecharge,
                    rechargeAmount: v.matchedRecharge?.amount
                })));
            }
            
            // Render all sections
            renderDashboard();
            renderEntries();
            renderResults();
            renderWinners();
            
        } catch (error) {
            console.error('UnifiedPage: Error loading data:', error);
            AdminCore.showToast('Error loading data: ' + error.message, 'error');
        }
    }

    // ============================================
    // EVENT BINDING
    // ============================================
    
    function bindEvents() {
        // Chart metric selector
        document.getElementById('chartMetricSelect')?.addEventListener('change', (e) => {
            const { entries, recharges } = currentData;
            const dailyData = RechargeValidator.analyzeEngagementByDate(entries, recharges, 7);
            const canvas = document.getElementById('chartLast7Days');
            if (canvas) AdminCharts.createLast7DaysChart(canvas, dailyData, e.target.value);
        });
        
        // Entries filters
        const debouncedEntriesFilter = AdminCore.debounce(applyEntriesFilters, 300);
        document.getElementById('filterGameId')?.addEventListener('input', (e) => { entriesFilters.gameId = e.target.value; debouncedEntriesFilter(); });
        document.getElementById('filterWhatsapp')?.addEventListener('input', (e) => { entriesFilters.whatsapp = e.target.value; debouncedEntriesFilter(); });
        document.getElementById('filterContest')?.addEventListener('change', (e) => { entriesFilters.contest = e.target.value; applyEntriesFilters(); });
        document.getElementById('filterValidity')?.addEventListener('change', (e) => { entriesFilters.validity = e.target.value; applyEntriesFilters(); });
        
        // Column-based sorting (click table headers)
        document.querySelectorAll('#entriesTable th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.getAttribute('data-sort');
                if (sortColumn === col) {
                    // Toggle direction if same column
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    // New column, default to descending
                    sortColumn = col;
                    sortDirection = 'desc';
                }
                
                // Update header indicators
                document.querySelectorAll('#entriesTable th[data-sort]').forEach(h => {
                    const text = h.textContent.replace(/ [↑↓↕]/g, '');
                    if (h === th) {
                        h.textContent = text + (sortDirection === 'asc' ? ' ↑' : ' ↓');
                    } else {
                        h.textContent = text + ' ↕';
                    }
                });
                
                applyEntriesFilters();
            });
        });
        
        document.getElementById('btnClearFilters')?.addEventListener('click', () => {
            entriesFilters = { gameId: '', whatsapp: '', contest: '', validity: 'all' };
            sortColumn = 'registrationDateTime';
            sortDirection = 'desc';
            document.getElementById('filterGameId').value = '';
            document.getElementById('filterWhatsapp').value = '';
            document.getElementById('filterContest').value = '';
            document.getElementById('filterValidity').value = 'all';
            
            // Reset header indicators
            document.querySelectorAll('#entriesTable th[data-sort]').forEach(h => {
                const text = h.textContent.replace(/ [↑↓↕]/g, '');
                h.textContent = text + ' ↕';
            });
            
            applyEntriesFilters();
        });
        document.getElementById('btnExportCSV')?.addEventListener('click', exportEntriesCSV);
        document.getElementById('btnPrevPage')?.addEventListener('click', () => { if (entriesPage > 1) { entriesPage--; renderEntriesTable(); renderEntriesPagination(); } });
        document.getElementById('btnNextPage')?.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredEntries.length / entriesPerPage);
            if (entriesPage < totalPages) { entriesPage++; renderEntriesTable(); renderEntriesPagination(); }
        });
        document.getElementById('perPageSelect')?.addEventListener('change', (e) => {
            entriesPerPage = parseInt(e.target.value);
            entriesPage = 1;
            renderEntriesTable();
            renderEntriesPagination();
        });
        
        // Results search
        const debouncedResultsSearch = AdminCore.debounce(renderResultsTable, 300);
        document.getElementById('searchResults')?.addEventListener('input', (e) => { resultsSearchTerm = e.target.value; debouncedResultsSearch(); });
        
        // Winners filters
        document.getElementById('filterWinnersContest')?.addEventListener('change', (e) => { winnersFilters.contest = e.target.value; applyWinnersFilters(); });
        document.getElementById('filterWinnersPrizeLevel')?.addEventListener('change', (e) => { winnersFilters.prizeLevel = e.target.value; applyWinnersFilters(); });
        document.getElementById('btnClearWinnersFilters')?.addEventListener('click', () => {
            winnersFilters = { contest: '', prizeLevel: 'all' };
            document.getElementById('filterWinnersContest').value = '';
            document.getElementById('filterWinnersPrizeLevel').value = 'all';
            applyWinnersFilters();
        });
        document.getElementById('btnExportWinnersCSV')?.addEventListener('click', exportWinnersCSV);
        
        // Clear cache button
        document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
            DataStore.clearStorage();
            AdminCore.showToast('Cache cleared! Refreshing...', 'success');
            setTimeout(() => loadAllData(true), 500);
        });
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    
    function init() {
        console.log('UnifiedPage: Initializing...');
        
        bindEvents();
        
        // Always load fresh data on init
        loadAllData(true);
        
        isInitialized = true;
    }

    // Event listeners
    if (typeof AdminCore !== 'undefined') {
        AdminCore.on('refresh', () => {
            console.log('UnifiedPage: Refresh event received');
            loadAllData(true);
        });
        
        AdminCore.on('dataStoreReady', ({ fromCache }) => {
            // Only reload if data came from network (not cache)
            if (!fromCache && isInitialized) {
                console.log('UnifiedPage: Fresh data ready, re-rendering');
                loadAllData(false); // Don't force refresh again, just re-render
            }
        });
        
        AdminCore.on('platformChange', ({ platform }) => {
            console.log('UnifiedPage: Platform changed to', platform);
            loadAllData(false); // Re-render with new platform filter
        });
    }

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Small delay to ensure AdminCore is ready
        setTimeout(init, 50);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        init,
        loadAllData,
        goToEntriesPage,
        showTicketDetails,
        exportEntriesCSV,
        exportWinnersCSV
    };
})();

