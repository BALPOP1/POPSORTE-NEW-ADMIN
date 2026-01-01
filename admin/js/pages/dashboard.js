/**
 * POP-SORTE Admin Dashboard - Dashboard Page Module
 * 
 * This module renders the main dashboard with:
 * 1. All-Time Stats section
 * 2. Engagement Overview section
 * 3. Last 7 Days Statistics chart
 * 4. Recharge vs Tickets table
 * 5. Winners by Contest cards
 * 6. Top Entrants table
 * 7. Latest Entries cards
 * 
 * Dependencies: AdminCore, DataFetcher, ResultsFetcher, RechargeValidator, WinnerCalculator, AdminCharts
 */

// ============================================
// Dashboard Page Module
// ============================================
window.DashboardPage = (function() {
    'use strict';

    // ============================================
    // State
    // ============================================
    let isInitialized = false;
    let currentData = {
        entries: [],
        recharges: [],
        results: []
    };

    // ============================================
    // HTML Templates
    // ============================================
    
    /**
     * Generate the dashboard HTML structure
     * @returns {string} HTML string
     */
    function getTemplate() {
        return `
            <div class="dashboard-content">
                <!-- All-Time Stats -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">📊 General Data (All Time)</h2>
                    </div>
                    <div class="stats-grid" id="allTimeStats">
                        <div class="stat-card primary">
                            <span class="stat-label">Total Tickets</span>
                            <span class="stat-value" id="statTotalTickets">--</span>
                        </div>
                        <div class="stat-card info">
                            <span class="stat-label">Total Contests</span>
                            <span class="stat-value" id="statTotalContests">--</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Draw Dates</span>
                            <span class="stat-value" id="statDrawDates">--</span>
                        </div>
                        <div class="stat-card warning">
                            <span class="stat-label">Pending</span>
                            <span class="stat-value" id="statPending">--</span>
                        </div>
                        <div class="stat-card success">
                            <span class="stat-label">Total Winners</span>
                            <span class="stat-value" id="statTotalWinners">--</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Win Rate</span>
                            <span class="stat-value" id="statWinRate">--</span>
                        </div>
                    </div>
                </section>

                <!-- Engagement Overview -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">👥 Engagement Overview</h2>
                    </div>
                    <div class="grid-2">
                        <div class="card">
                            <div class="card-body">
                                <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
                                    <div class="stat-card success">
                                        <span class="stat-label">Rechargers</span>
                                        <span class="stat-value" id="statRechargers">--</span>
                                    </div>
                                    <div class="stat-card primary">
                                        <span class="stat-label">Participants</span>
                                        <span class="stat-value" id="statParticipants">--</span>
                                    </div>
                                    <div class="stat-card warning">
                                        <span class="stat-label">Recharged No Ticket</span>
                                        <span class="stat-value" id="statNoTicket">--</span>
                                    </div>
                                    <div class="stat-card info">
                                        <span class="stat-label">Participation Rate</span>
                                        <span class="stat-value" id="statParticipationRate">--</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">Ticket Creators</h3>
                                <span class="text-muted">Today vs Yesterday</span>
                            </div>
                            <div class="card-body">
                                <div class="chart-container" style="height: 200px;">
                                    <canvas id="chartCreatorsComparison"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Last 7 Days Chart -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">📈 Last 7 Days</h2>
                        <div class="filter-group">
                            <select id="chartMetricSelect" class="form-select" style="width: auto;">
                                <option value="all">All metrics</option>
                                <option value="entries">Tickets</option>
                                <option value="rechargers">Rechargers</option>
                                <option value="participants">Participants</option>
                                <option value="noTicket">No Ticket</option>
                            </select>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <div class="chart-container">
                                <canvas id="chartLast7Days"></canvas>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Recharge vs Tickets Table -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">📊 Recharges vs Tickets (Last 7 Days)</h2>
                    </div>
                    <div class="card">
                        <div class="table-container">
                            <table class="table" id="rechargeVsTicketsTable">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Rechargers</th>
                                        <th>Creators</th>
                                        <th>No Ticket</th>
                                        <th>Participation %</th>
                                        <th>Non-Part. %</th>
                                        <th>Total Tickets</th>
                                    </tr>
                                </thead>
                                <tbody id="rechargeVsTicketsBody">
                                    <tr><td colspan="7" class="text-center text-muted">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- Winners by Contest -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">🏆 Winners by Contest</h2>
                    </div>
                    <div id="winnersByContestContainer" class="grid-2">
                        <div class="card">
                            <div class="card-body text-center text-muted">
                                Loading winners...
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Top Entrants -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">🎯 Top Participants</h2>
                    </div>
                    <div class="card">
                        <div class="table-container">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>WhatsApp</th>
                                        <th>Total Entries</th>
                                        <th>Wins</th>
                                        <th>Best Prize</th>
                                    </tr>
                                </thead>
                                <tbody id="topEntrantsBody">
                                    <tr><td colspan="5" class="text-center text-muted">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- Latest Entries -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">🎫 Latest Entries</h2>
                    </div>
                    <div class="card">
                        <div class="table-container">
                            <table class="table" id="latestEntriesTable">
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th>Time</th>
                                        <th>Game ID</th>
                                        <th>Numbers</th>
                                        <th>Contest</th>
                                        <th>Draw Date</th>
                                    </tr>
                                </thead>
                                <tbody id="latestEntriesContainer">
                                    <tr><td colspan="6" class="text-center text-muted">Loading entries...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    // ============================================
    // Render Functions
    // ============================================
    
    /**
     * Render all-time statistics
     */
    function renderAllTimeStats() {
        const { entries, results } = currentData;
        
        // Total tickets
        document.getElementById('statTotalTickets').textContent = entries.length.toLocaleString();
        
        // Unique contests
        const contests = new Set(entries.map(e => e.contest).filter(Boolean));
        document.getElementById('statTotalContests').textContent = contests.size.toLocaleString();
        
        // Unique draw dates
        const drawDates = new Set(entries.map(e => e.drawDate).filter(Boolean));
        document.getElementById('statDrawDates').textContent = drawDates.size.toLocaleString();
        
        // Pending entries
        const pending = entries.filter(e => {
            const status = (e.status || '').toUpperCase();
            return !['VALID', 'VALIDADO', 'INVALID', 'INVÁLIDO'].includes(status);
        });
        document.getElementById('statPending').textContent = pending.length.toLocaleString();
    }

    /**
     * Render winners stats
     */
    async function renderWinnersStats() {
        try {
            const { entries, results } = currentData;
            const winnerStats = await WinnerCalculator.getWinnerStats(entries, results);
            
            document.getElementById('statTotalWinners').textContent = winnerStats.totalWinners.toLocaleString();
            document.getElementById('statWinRate').textContent = `${winnerStats.winRate}%`;
        } catch (error) {
            console.error('Error rendering winners stats:', error);
        }
    }

    /**
     * Render engagement overview
     */
    function renderEngagementOverview() {
        const { entries, recharges } = currentData;
        
        // If no recharges, show ticket creators only
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
        
        // Render comparison chart
        const now = AdminCore.getBrazilTime();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const comparison = WinnerCalculator.compareTicketCreators(entries, now, yesterday);
        
        const canvas = document.getElementById('chartCreatorsComparison');
        if (canvas) {
            AdminCharts.createCreatorsComparisonChart(canvas, comparison);
        }
    }

    /**
     * Render last 7 days chart
     * @param {string} metric - Selected metric
     */
    function renderLast7DaysChart(metric = 'all') {
        const { entries, recharges } = currentData;
        const dailyData = RechargeValidator.analyzeEngagementByDate(entries, recharges, 7);
        
        const canvas = document.getElementById('chartLast7Days');
        if (canvas) {
            AdminCharts.createLast7DaysChart(canvas, dailyData, metric);
        }
    }

    /**
     * Render recharge vs tickets table
     */
    function renderRechargeVsTicketsTable() {
        const { entries, recharges } = currentData;
        const dailyData = RechargeValidator.analyzeEngagementByDate(entries, recharges, 7);
        
        const tbody = document.getElementById('rechargeVsTicketsBody');
        if (!tbody) return;
        
        if (dailyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No data</td></tr>';
            return;
        }
        
        // Check if recharge data is available
        const hasRechargeData = recharges && recharges.length > 0;
        
        tbody.innerHTML = dailyData.map(day => {
            const nonParticipationRate = day.totalRechargers > 0
                ? ((day.rechargedNoTicket / day.totalRechargers) * 100).toFixed(1)
                : '-';
            
            return `
                <tr>
                    <td><strong>${day.displayDate}</strong></td>
                    <td>${hasRechargeData ? day.totalRechargers : '<span class="text-muted">-</span>'}</td>
                    <td>${hasRechargeData ? day.totalParticipants : '<span class="text-muted">-</span>'}</td>
                    <td class="text-warning">${hasRechargeData ? day.rechargedNoTicket : '<span class="text-muted">-</span>'}</td>
                    <td class="text-success">${hasRechargeData ? day.participationRate + '%' : '<span class="text-muted">-</span>'}</td>
                    <td class="text-danger">${hasRechargeData && day.totalRechargers > 0 ? nonParticipationRate + '%' : '<span class="text-muted">-</span>'}</td>
                    <td><strong>${day.totalEntries}</strong></td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Render winners by contest cards
     */
    async function renderWinnersByContest() {
        const container = document.getElementById('winnersByContestContainer');
        if (!container) return;
        
        try {
            const { entries, results } = currentData;
            const calculation = await WinnerCalculator.calculateAllWinners(entries, results);
            
            // Get last 6 contests with results
            const contestsWithResults = calculation.contestResults
                .filter(c => c.hasResult)
                .slice(0, 6);
            
            if (contestsWithResults.length === 0) {
                container.innerHTML = `
                    <div class="card">
                        <div class="card-body text-center text-muted">
                            No contest results available
                        </div>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = contestsWithResults.map(contest => {
                const numbersHtml = contest.winningNumbers.map(n => {
                    const colorClass = AdminCore.getBallColorClass(n);
                    return `<span class="number-badge ${colorClass}">${String(n).padStart(2, '0')}</span>`;
                }).join('');
                
                const tierCounts = [];
                for (let tier = 5; tier >= 1; tier--) {
                    const count = contest.byTier[tier]?.filter(w => w.isValidEntry).length || 0;
                    if (count > 0) {
                        const tierInfo = WinnerCalculator.PRIZE_TIERS[tier];
                        tierCounts.push(`<span class="badge badge-info">${tierInfo.emoji} ${tier}: ${count}</span>`);
                    }
                }
                
                return `
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h4 class="card-title mb-0">Contest #${contest.contest}</h4>
                                <span class="text-muted">${contest.drawDate}</span>
                            </div>
                            <span class="badge badge-gray">${contest.totalEntries} entries</span>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <span class="text-muted" style="font-size: 0.75rem;">Winning Numbers</span>
                                <div class="numbers-display mt-1">
                                    ${numbersHtml}
                                </div>
                            </div>
                            <div>
                                <span class="text-muted" style="font-size: 0.75rem;">Winners by Matches</span>
                                <div class="d-flex gap-2 mt-1" style="flex-wrap: wrap;">
                                    ${tierCounts.length > 0 ? tierCounts.join('') : '<span class="text-muted">No winners</span>'}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error rendering winners by contest:', error);
            container.innerHTML = `
                <div class="card">
                    <div class="card-body text-center text-danger">
                        Error loading winners
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render top entrants table
     */
    async function renderTopEntrants() {
        const tbody = document.getElementById('topEntrantsBody');
        if (!tbody) return;
        
        try {
            const { entries, results } = currentData;
            const topEntrants = DataFetcher.getTopEntrants(entries, 10);
            const calculation = await WinnerCalculator.calculateAllWinners(entries, results);
            const playerWins = WinnerCalculator.groupWinnersByPlayer(calculation.allWinners);
            
            // Create wins lookup
            const winsLookup = {};
            playerWins.forEach(p => {
                winsLookup[p.gameId] = p;
            });
            
            if (topEntrants.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No participants</td></tr>';
                return;
            }
            
            tbody.innerHTML = topEntrants.map((entrant, index) => {
                const wins = winsLookup[entrant.gameId];
                const totalWins = wins ? wins.totalWins : 0;
                const bestMatch = wins ? wins.bestMatch : 0;
                const bestPrize = bestMatch > 0 ? `${WinnerCalculator.PRIZE_TIERS[bestMatch]?.emoji || ''} ${bestMatch} matches` : '-';
                
                return `
                    <tr>
                        <td><strong>${index + 1}</strong></td>
                        <td>${AdminCore.maskWhatsApp(entrant.whatsapp)}</td>
                        <td><strong>${entrant.count}</strong></td>
                        <td>${totalWins > 0 ? `<span class="badge badge-success">${totalWins}</span>` : '-'}</td>
                        <td>${bestPrize}</td>
                    </tr>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error rendering top entrants:', error);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading</td></tr>';
        }
    }

    /**
     * Render latest entries table rows
     */
    function renderLatestEntries() {
        const container = document.getElementById('latestEntriesContainer');
        if (!container) return;
        
        const { entries } = currentData;
        const latest = entries.slice(0, 15); // Show 15 entries
        
        if (latest.length === 0) {
            container.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No entries found</td></tr>';
            return;
        }
        
        container.innerHTML = latest.map(entry => {
            const numbersHtml = entry.numbers.map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width: 26px; height: 26px; font-size: 0.65rem;">${String(n).padStart(2, '0')}</span>`;
            }).join('');
            
            const statusClass = {
                'VALID': 'success',
                'VALIDADO': 'success',
                'INVALID': 'danger',
                'INVÁLIDO': 'danger'
            }[entry.status.toUpperCase()] || 'warning';
            
            const statusLabel = {
                'VALID': 'Valid',
                'VALIDADO': 'Valid',
                'INVALID': 'Invalid',
                'INVÁLIDO': 'Invalid'
            }[entry.status.toUpperCase()] || 'Pending';
            
            const formattedTime = entry.parsedDate
                ? AdminCore.formatBrazilDateTime(entry.parsedDate, {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : entry.timestamp;
            
            return `
                <tr>
                    <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
                    <td style="font-size: 0.85rem; white-space: nowrap;">${formattedTime}</td>
                    <td><strong>${entry.gameId}</strong></td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td>${entry.contest}</td>
                    <td>${entry.drawDate}</td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // Data Loading
    // ============================================
    
    /**
     * Load all dashboard data
     */
    async function loadData() {
        try {
            const [entries, recharges, results] = await Promise.all([
                DataFetcher.fetchEntries(),
                DataFetcher.fetchRecharges(),
                ResultsFetcher.fetchResults()
            ]);
            
            currentData = { entries, recharges, results };
            
            // Render all sections
            renderAllTimeStats();
            renderWinnersStats();
            renderEngagementOverview();
            renderLast7DaysChart('all');
            renderRechargeVsTicketsTable();
            renderWinnersByContest();
            renderTopEntrants();
            renderLatestEntries();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            AdminCore.showToast('Error loading dashboard data', 'error');
        }
    }

    // ============================================
    // Event Handlers
    // ============================================
    
    /**
     * Handle metric selector change
     */
    function handleMetricChange(e) {
        renderLast7DaysChart(e.target.value);
    }

    // ============================================
    // Initialization
    // ============================================
    
    /**
     * Initialize the dashboard page
     */
    function init() {
        const container = document.getElementById('page-dashboard');
        if (!container) return;
        
        // Render template
        container.innerHTML = getTemplate();
        
        // Bind events
        const metricSelect = document.getElementById('chartMetricSelect');
        if (metricSelect) {
            metricSelect.addEventListener('change', handleMetricChange);
        }
        
        // Load data
        loadData();
        
        isInitialized = true;
    }

    /**
     * Refresh the dashboard
     */
    function refresh() {
        if (isInitialized) {
            loadData();
        }
    }

    // Listen for page changes
    if (typeof AdminCore !== 'undefined') {
        AdminCore.on('pageChange', ({ page }) => {
            if (page === 'dashboard') {
                if (!isInitialized) {
                    init();
                } else {
                    refresh();
                }
            }
        });
        
        AdminCore.on('refresh', refresh);
    }

    // Initialize if dashboard is the current page
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.location.hash === '#dashboard' || window.location.hash === '') {
                init();
            }
        });
    } else {
        if (window.location.hash === '#dashboard' || window.location.hash === '') {
            init();
        }
    }

    // ============================================
    // Public API
    // ============================================
    return {
        init,
        refresh,
        loadData
    };
})();
