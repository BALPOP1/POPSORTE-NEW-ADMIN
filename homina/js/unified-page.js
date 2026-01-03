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
    let sortBy = 'date-desc'; // Default: newest first
    
    /**
     * Check if entry was registered after cutoff time (20:00 BRT, 16:00 on Dec 24/31)
     * @param {Object} entry - Entry object with parsedDate
     * @returns {boolean} True if after cutoff
     */
    function isEntryCutoff(entry) {
        if (!entry.parsedDate || !(entry.parsedDate instanceof Date) || isNaN(entry.parsedDate.getTime())) {
            return false;
        }
        
        const regHour = entry.parsedDate.getHours();
        const month = entry.parsedDate.getMonth();
        const day = entry.parsedDate.getDate();
        
        // Check for early cutoff days (Dec 24, Dec 31)
        const isEarlyCutoffDay = month === 11 && (day === 24 || day === 31);
        const cutoffHour = isEarlyCutoffDay ? 16 : 20;
        
        return regHour >= cutoffHour;
    }
    
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
        
        // Stats - ✅ COUNT DIRECTLY FROM CSV STATUS COLUMN + CUTOFF DETECTION
        const validCount = entries.filter(e => {
            const status = (e.status || '').toUpperCase();
            return status === 'VALID' || status === 'VÁLIDO';
        }).length;
        
        const invalidCount = entries.filter(e => {
            const status = (e.status || '').toUpperCase();
            return status === 'INVALID' || status === 'INVÁLIDO';
        }).length;
        
        const cutoffCount = entries.filter(e => isEntryCutoff(e)).length;
        
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
            result = result.filter(e => {
                // ✅ READ STATUS DIRECTLY FROM CSV (Column H - STATUS)
                const csvStatus = (e.status || 'UNKNOWN').toUpperCase();
                const isValid = csvStatus === 'VALID' || csvStatus === 'VÁLIDO';
                const isInvalid = csvStatus === 'INVALID' || csvStatus === 'INVÁLIDO';
                return entriesFilters.validity === 'valid' ? isValid : isInvalid;
            });
        }
        
        // ✅ APPLY SORTING
        switch (sortBy) {
            case 'date-asc':
                result.sort((a, b) => {
                    if (!a.parsedDate || !b.parsedDate) return 0;
                    return a.parsedDate.getTime() - b.parsedDate.getTime();
                });
                break;
            case 'date-desc':
                result.sort((a, b) => {
                    if (!a.parsedDate || !b.parsedDate) return 0;
                    return b.parsedDate.getTime() - a.parsedDate.getTime();
                });
                break;
            case 'cutoff-yes':
                result.sort((a, b) => {
                    const aCutoff = isEntryCutoff(a) ? 1 : 0;
                    const bCutoff = isEntryCutoff(b) ? 1 : 0;
                    return bCutoff - aCutoff; // Cutoff first
                });
                break;
            case 'cutoff-no':
                result.sort((a, b) => {
                    const aCutoff = isEntryCutoff(a) ? 1 : 0;
                    const bCutoff = isEntryCutoff(b) ? 1 : 0;
                    return aCutoff - bCutoff; // No cutoff first
                });
                break;
            case 'status-valid':
                result.sort((a, b) => {
                    const aStatus = (a.status || '').toUpperCase();
                    const bStatus = (b.status || '').toUpperCase();
                    const aValid = (aStatus === 'VALID' || aStatus === 'VÁLIDO') ? 1 : 0;
                    const bValid = (bStatus === 'VALID' || bStatus === 'VÁLIDO') ? 1 : 0;
                    return bValid - aValid; // Valid first
                });
                break;
            case 'status-invalid':
                result.sort((a, b) => {
                    const aStatus = (a.status || '').toUpperCase();
                    const bStatus = (b.status || '').toUpperCase();
                    const aInvalid = (aStatus === 'INVALID' || aStatus === 'INVÁLIDO') ? 1 : 0;
                    const bInvalid = (bStatus === 'INVALID' || bStatus === 'INVÁLIDO') ? 1 : 0;
                    return bInvalid - aInvalid; // Invalid first
                });
                break;
        }
        
        filteredEntries = result;
        entriesPage = 1;
        renderEntriesTable();
        renderEntriesPagination();
    }

    function renderEntriesTable() {
        const tbody = document.getElementById('entriesTableBody');
        if (!tbody) {
            console.error('❌ entriesTableBody element not found!');
            return;
        }
        
        console.log('🔍 RECHARGE DATA CHECK:');
        console.log('   Total allRecharges:', currentData.allRecharges?.length || 0);
        if (currentData.allRecharges && currentData.allRecharges.length > 0) {
            console.log('   First recharge:', currentData.allRecharges[0]);
            console.log('   First 3 gameIds:', currentData.allRecharges.slice(0, 3).map(r => r.gameId));
        }
        if (filteredEntries.length > 0) {
            console.log('   First entry gameId:', filteredEntries[0].gameId);
        }
        
        const start = (entriesPage - 1) * entriesPerPage;
        const pageEntries = filteredEntries.slice(start, start + entriesPerPage);
        
        console.log(`📊 Rendering ${pageEntries.length} entries (page ${entriesPage}, start ${start})`);
        
        if (pageEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No entries found</td></tr>';
            return;
        }
        
        try {
            tbody.innerHTML = pageEntries.map((entry, index) => {
            // ✅ READ STATUS DIRECTLY FROM CSV (Column H - STATUS)
            const csvStatus = (entry.status || 'UNKNOWN').toUpperCase();
            const status = csvStatus;
            
            // Check for CUTOFF (registered after 20:00 BRT)
            const isCutoff = isEntryCutoff(entry);
            
            // Debug ONLY first entry to avoid performance issues
            if (index === 0) {
                console.log('🎯 FIRST ENTRY:', entry.gameId, entry.ticketNumber);
                console.log('   CSV Status:', entry.status);
                console.log('   Parsed Status:', status);
                console.log('   Is Cutoff:', isCutoff);
            }
            
            // Status badge based on CSV column + CUTOFF indicator
            let statusBadge = '';
            switch (status) {
                case 'VALID':
                case 'VÁLIDO':
                    statusBadge = '<span class="badge badge-success">✅ VALID</span>';
                    break;
                case 'INVALID':
                case 'INVÁLIDO':
                    statusBadge = '<span class="badge badge-danger">❌ INVALID</span>';
                    break;
                default:
                    statusBadge = '<span class="badge badge-warning">⏳ PENDING</span>';
            }
            
            // Add CUTOFF badge if applicable
            if (isCutoff) {
                statusBadge += ' <span class="badge badge-warning" style="margin-left:4px; font-size:0.75rem">⚠️ CUTOFF</span>';
            }
            
            // Format date/time
            const formattedTime = entry.parsedDate
                ? AdminCore.formatBrazilDateTime(entry.parsedDate, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                : entry.timestamp;
            
            // Render number badges
            const numbersHtml = entry.numbers.slice(0, 5).map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:24px;height:24px;font-size:0.6rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            const platform = (entry.platform || 'POPN1').toUpperCase();
            
            // RECHARGE INFO - Only show for VALID tickets using validation data
            let rechargeInfo = '-';
            
            // Get validation status for this entry
            if (validationResult && validationResult.matchedRecharge) {
                const r = validationResult.matchedRecharge;
                const chargeAmount = r.amount || 0;
                let amountDisplay = `R$ ${chargeAmount.toFixed(2)}`;
                
                // Add Day 2 badge if using second eligibility window
                if (validationResult.isDay2) {
                    amountDisplay += ' <span class="badge badge-warning" style="font-size:0.6rem;">⚠️ DAY 2</span>';
                }
                
                // Order Number (shortened)
                const orderNumber = r.rechargeId || '';
                const shortOrderNumber = orderNumber.length > 20 ? orderNumber.substring(0, 20) + '...' : orderNumber;
                
                // Recharge Time
                let timeDisplay = '-';
                if (r.rechargeTime instanceof Date && !isNaN(r.rechargeTime.getTime())) {
                    timeDisplay = AdminCore.formatBrazilDateTime(r.rechargeTime, { 
                        day: '2-digit', 
                        month: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                } else if (r.rechargeTimeRaw) {
                    timeDisplay = r.rechargeTimeRaw;
                }
                
                rechargeInfo = `
                    <div class="recharge-details">
                        <div class="recharge-id" title="Order: ${orderNumber}" style="font-size:0.65rem;color:var(--text-secondary);margin-bottom:2px;">${shortOrderNumber}</div>
                        <div class="recharge-time" style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">${timeDisplay}</div>
                        <div class="recharge-amount"><strong style="color:var(--success);">${amountDisplay}</strong></div>
                    </div>
                `;
                
                // Debug first entry with recharge
                if (index === 0) {
                    console.log('💰 VALID RECHARGE for first entry:');
                    console.log('   Game ID:', entry.gameId);
                    console.log('   Order:', shortOrderNumber);
                    console.log('   Time:', timeDisplay);
                    console.log('   Amount:', chargeAmount);
                    console.log('   Day 2:', validationResult.isDay2);
                }
            } else if (index === 0) {
                console.log('❌ NO VALID RECHARGE for first entry');
            }
            
            // WhatsApp masked display
            const whatsappDisplay = AdminCore.maskWhatsApp(entry.whatsapp);
            
            return `
                <tr>
                    <td>${statusBadge}</td>
                    <td style="font-size:0.8rem;white-space:nowrap">${formattedTime}</td>
                    <td><span class="platform-badge ${platform.toLowerCase()}">${platform}</span></td>
                    <td><strong>${entry.gameId}</strong></td>
                    <td style="font-size:0.75rem">${whatsappDisplay}</td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td style="font-size:0.8rem">${entry.drawDate || '-'}</td>
                    <td><span class="badge badge-info">${entry.contest}</span></td>
                    <td style="font-size:0.9rem">${entry.ticketNumber}</td>
                    <td>${rechargeInfo}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="UnifiedPage.showTicketDetails('${entry.ticketNumber}')">Details</button></td>
                </tr>
            `;
            }).join('');
            
            console.log('✅ Table HTML generated successfully');
        } catch (error) {
            console.error('❌ ERROR rendering table:', error);
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-danger">Error loading entries. Check console for details.</td></tr>';
        }
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
        const entry = currentData.entries.find(e => e.ticketNumber === ticketNumber);
        if (!entry) return;
        
        const modalContent = document.getElementById('ticketModalContent');
        if (!modalContent) return;
        
        // ✅ VALIDATION STATUS - READ DIRECTLY FROM CSV (Column H - STATUS)
        const csvStatus = (entry.status || 'UNKNOWN').toUpperCase();
        const status = csvStatus;
        const isCutoff = isEntryCutoff(entry);
        const statusClass = { 'VALID': 'success', 'INVALID': 'danger', 'VÁLIDO': 'success', 'INVÁLIDO': 'danger' }[csvStatus] || 'warning';
        const statusIcon = (status === 'VALID' || status === 'VÁLIDO') ? '✅' : (status === 'INVALID' || status === 'INVÁLIDO') ? '❌' : '⏳';
        const statusText = (status === 'VALID' || status === 'VÁLIDO') ? 'VALID' : (status === 'INVALID' || status === 'INVÁLIDO') ? 'INVALID' : 'PENDING';
        
        const cutoffWarning = isCutoff ? '<br><span class="text-warning">⚠️ Registered after cutoff time (20:00 BRT)</span>' : '';
        
        const statusHtml = `<div class="status-banner ${statusClass} mb-4">
            <span class="status-banner-icon">${statusIcon}</span>
            <span class="status-banner-text">
                <strong>${statusText}</strong> - Status from CSV${cutoffWarning}
            </span>
        </div>`;
        
        // Render number badges
        const numbersHtml = entry.numbers.map(n => {
            const colorClass = AdminCore.getBallColorClass(n);
            return `<span class="number-badge ${colorClass}">${String(n).padStart(2,'0')}</span>`;
        }).join('');
        
        // RECHARGE INFORMATION - Only show for VALID tickets
        let rechargeHtml = '<p class="text-muted">No linked recharge</p>';
        
        // Only show recharge info for VALID tickets
        if (statusText === 'VALID') {
            // Get validation data if available
            const validation = currentData.validationResults?.results?.find(v => v.ticket?.ticketNumber === ticketNumber);
            
            if (validation && validation.matchedRecharge) {
                const r = validation.matchedRecharge;
                const orderNumber = r.rechargeId || '-';
                const chargeAmount = r.amount || 0;
                let amountDisplay = `R$ ${chargeAmount.toFixed(2)}`;
                
                // Add Day 2 warning if applicable
                let day2Warning = '';
                if (validation.isDay2) {
                    day2Warning = `
                        <div class="status-banner warning mb-3">
                            <span class="status-banner-icon">⚠️</span>
                            <span class="status-banner-text">
                                <strong>Day 2 Eligibility</strong> - This ticket uses the 2nd eligible draw day from the recharge
                            </span>
                        </div>
                    `;
                    amountDisplay += ' <span class="badge badge-warning">⚠️ DAY 2</span>';
                }
                
                let timeDisplay = '-';
                if (r.rechargeTime instanceof Date && !isNaN(r.rechargeTime.getTime())) {
                    timeDisplay = AdminCore.formatBrazilDateTime(r.rechargeTime, { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                    });
                } else if (r.rechargeTimeRaw) {
                    timeDisplay = r.rechargeTimeRaw;
                }
                
                rechargeHtml = `
                    ${day2Warning}
                    <div class="ticket-info-grid">
                        <div class="ticket-info-item">
                            <span class="label">💰 Amount</span>
                            <span class="value text-success"><strong>${amountDisplay}</strong></span>
                        </div>
                        <div class="ticket-info-item">
                            <span class="label">📋 Order Number</span>
                            <span class="value" style="font-size:0.7rem;word-break:break-all">${orderNumber}</span>
                        </div>
                        <div class="ticket-info-item">
                            <span class="label">⏰ Recharge Time</span>
                            <span class="value">${timeDisplay}</span>
                        </div>
                        <div class="ticket-info-item">
                            <span class="label">🎮 Game ID</span>
                            <span class="value">${r.gameId}</span>
                        </div>
                    </div>
                `;
            }
        }
        
        modalContent.innerHTML = `
            ${statusHtml}
            
            <h4 class="mb-3">📋 Ticket Information</h4>
            <div class="ticket-info-grid mb-4">
                <div class="ticket-info-item">
                    <span class="label">Ticket Number</span>
                    <span class="value">${entry.ticketNumber}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Game ID</span>
                    <span class="value"><strong>${entry.gameId}</strong></span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">WhatsApp</span>
                    <span class="value">${entry.whatsapp || '-'}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Platform</span>
                    <span class="value"><span class="platform-badge ${(entry.platform || 'POPN1').toLowerCase()}">${entry.platform || 'POPN1'}</span></span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Contest</span>
                    <span class="value"><span class="badge badge-info">${entry.contest}</span></span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Draw Date</span>
                    <span class="value">${entry.drawDate || '-'}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Registered</span>
                    <span class="value">${entry.parsedDate ? AdminCore.formatBrazilDateTime(entry.parsedDate) : entry.timestamp}</span>
                </div>
                <div class="ticket-info-item">
                    <span class="label">Original Status</span>
                    <span class="value">${entry.status || 'N/A'}</span>
                </div>
            </div>
            
            <h4 class="mb-3">🎲 Selected Numbers</h4>
            <div class="numbers-display mb-4">${numbersHtml}</div>
            
            <h4 class="mb-3">💳 Linked Recharge</h4>
            ${rechargeHtml}
        `;
        
        AdminCore.openModal('ticketModal');
    }

    function exportEntriesCSV() {
        if (filteredEntries.length === 0) {
            AdminCore.showToast('No data to export', 'warning');
            return;
        }
        
        const headers = ['Status', 'Date/Time', 'Platform', 'Game ID', 'Numbers', 'Contest', 'Ticket #'];
        const rows = filteredEntries.map(entry => {
            // ✅ READ STATUS DIRECTLY FROM CSV (Column H - STATUS)
            const csvStatus = (entry.status || 'UNKNOWN').toUpperCase();
            return [
                csvStatus,
                entry.timestamp,
                entry.platform,
                entry.gameId,
                entry.numbers.join(', '),
                entry.contest,
                entry.ticketNumber
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entries_${AdminCore.getBrazilDateString(new Date())}.csv`;
        link.click();
        
        AdminCore.showToast(`${filteredEntries.length} entries exported`, 'success');
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
        document.getElementById('sortBy')?.addEventListener('change', (e) => { sortBy = e.target.value; applyEntriesFilters(); });
        document.getElementById('btnClearFilters')?.addEventListener('click', () => {
            entriesFilters = { gameId: '', whatsapp: '', contest: '', validity: 'all' };
            sortBy = 'date-desc';
            document.getElementById('filterGameId').value = '';
            document.getElementById('filterWhatsapp').value = '';
            document.getElementById('filterContest').value = '';
            document.getElementById('filterValidity').value = 'all';
            document.getElementById('sortBy').value = 'date-desc';
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

