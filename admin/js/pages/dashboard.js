/**
 * POP-SORTE Admin Dashboard - Dashboard Page Module
 * 
 * LAZY LOADING ARCHITECTURE:
 * - Shows quick counts IMMEDIATELY from DataStore
 * - Charts and detailed stats render progressively
 * - Winner calculations only run when scrolled into view
 * 
 * Dependencies: AdminCore, DataStore, AdminCharts
 */

window.DashboardPage = (function() {
    'use strict';

    // ============================================
    // State
    // ============================================
    let isInitialized = false;

    // ============================================
    // HTML Template
    // ============================================
    
    function getTemplate() {
        return `
            <div class="dashboard-content">
                <!-- Quick Stats (loads instantly) -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">📊 Overview</h2>
                    </div>
                    <div class="stats-grid" id="quickStats">
                        <div class="stat-card primary">
                            <span class="stat-label">Total Entries</span>
                            <span class="stat-value" id="statTotalEntries">--</span>
                        </div>
                        <div class="stat-card info">
                            <span class="stat-label">Unique Players</span>
                            <span class="stat-value" id="statUniquePlayers">--</span>
                        </div>
                        <div class="stat-card success">
                            <span class="stat-label">Valid (est.)</span>
                            <span class="stat-value" id="statValid">--</span>
                        </div>
                        <div class="stat-card danger">
                            <span class="stat-label">Invalid (est.)</span>
                            <span class="stat-value" id="statInvalid">--</span>
                        </div>
                        <div class="stat-card warning">
                            <span class="stat-label">Recharges</span>
                            <span class="stat-value" id="statRecharges">--</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Results</span>
                            <span class="stat-value" id="statResults">--</span>
                        </div>
                    </div>
                </section>

                <!-- Last 7 Days Chart -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">📈 Last 7 Days</h2>
                        <select id="chartMetricSelect" class="form-select form-select-sm" style="width: auto;">
                            <option value="entries">Entries</option>
                            <option value="players">Players</option>
                        </select>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <canvas id="chartLast7Days" height="200"></canvas>
                        </div>
                    </div>
                </section>

                <!-- Two Column Layout -->
                <div class="grid-2">
                    <!-- Top Players -->
                    <section class="section">
                        <div class="section-header">
                            <h2 class="section-title">🏆 Top Players</h2>
                        </div>
                        <div class="card">
                            <div class="table-container">
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Game ID</th>
                                            <th>Entries</th>
                                        </tr>
                                    </thead>
                                    <tbody id="topPlayersBody">
                                        <tr><td colspan="3" class="text-center text-muted">Loading...</td></tr>
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
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Game ID</th>
                                            <th>Numbers</th>
                                            <th>Contest</th>
                                        </tr>
                                    </thead>
                                    <tbody id="latestEntriesBody">
                                        <tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Recent Results -->
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">🎯 Recent Results</h2>
                    </div>
                    <div id="recentResultsContainer" class="results-grid">
                        <div class="card"><div class="card-body text-center text-muted">Loading...</div></div>
                    </div>
                </section>
            </div>
        `;
    }

    // ============================================
    // Render Functions (Fast - use DataStore directly)
    // ============================================
    
    /**
     * Render quick stats - INSTANT from DataStore
     */
    function renderQuickStats() {
        const counts = DataStore.getCounts();
        
        document.getElementById('statTotalEntries').textContent = counts.totalEntries.toLocaleString();
        document.getElementById('statUniquePlayers').textContent = counts.uniquePlayers.toLocaleString();
        document.getElementById('statValid').textContent = counts.estimatedValid.toLocaleString();
        document.getElementById('statInvalid').textContent = counts.estimatedInvalid.toLocaleString();
        document.getElementById('statRecharges').textContent = counts.totalRecharges.toLocaleString();
        document.getElementById('statResults').textContent = counts.totalResults.toLocaleString();
    }

    /**
     * Render last 7 days chart
     */
    function renderChart(metric = 'entries') {
        const data = DataStore.getEntriesByDate(7);
        const canvas = document.getElementById('chartLast7Days');
        if (!canvas || !data.length) return;
        
        // Simple chart using Chart.js
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if any
        if (canvas.chartInstance) {
            canvas.chartInstance.destroy();
        }
        
        const labels = data.map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        });
        
        const values = data.map(d => d.count);
        
        canvas.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: metric === 'entries' ? 'Entries' : 'Players',
                    data: values,
                    backgroundColor: 'rgba(6, 182, 212, 0.7)',
                    borderColor: 'rgba(6, 182, 212, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }

    /**
     * Render top players - fast, no validation needed
     */
    function renderTopPlayers() {
        const topPlayers = DataStore.getTopPlayers(10);
        const tbody = document.getElementById('topPlayersBody');
        if (!tbody) return;
        
        if (topPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No data</td></tr>';
            return;
        }
        
        tbody.innerHTML = topPlayers.map((player, i) => `
            <tr>
                <td><span class="badge badge-info">${i + 1}</span></td>
                <td><strong>${player.gameId}</strong></td>
                <td>${player.count.toLocaleString()}</td>
            </tr>
        `).join('');
    }

    /**
     * Render latest entries - fast, no validation needed
     */
    function renderLatestEntries() {
        const latest = DataStore.getLatestEntries(10);
        const tbody = document.getElementById('latestEntriesBody');
        if (!tbody) return;
        
        if (latest.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No entries</td></tr>';
            return;
        }
        
        tbody.innerHTML = latest.map(entry => {
            const time = entry.parsedDate
                ? AdminCore.formatBrazilDateTime(entry.parsedDate, { hour: '2-digit', minute: '2-digit' })
                : '--:--';
            
            const numbersHtml = entry.numbers.slice(0, 5).map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width:20px;height:20px;font-size:0.55rem">${String(n).padStart(2,'0')}</span>`;
            }).join('');
            
            return `
                <tr>
                    <td style="font-size:0.8rem">${time}</td>
                    <td><strong>${entry.gameId}</strong></td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td>${entry.contest}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Render recent results
     */
    function renderRecentResults() {
        const results = DataStore.getResults().slice(0, 4);
        const container = document.getElementById('recentResultsContainer');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = '<div class="card"><div class="card-body text-center text-muted">No results yet</div></div>';
            return;
        }
        
        container.innerHTML = results.map(result => {
            const numbersHtml = result.numbers.map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}">${String(n).padStart(2, '0')}</span>`;
            }).join('');
            
            return `
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-between align-center mb-2">
                            <strong>Contest ${result.contest}</strong>
                            <span class="text-muted">${result.drawDate}</span>
                        </div>
                        <div class="numbers-display">${numbersHtml}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================
    // Initialization
    // ============================================
    
    async function init() {
        const container = document.getElementById('page-dashboard');
        if (!container) return;
        
        // Render template immediately
        container.innerHTML = getTemplate();
        
        // Bind events
        const metricSelect = document.getElementById('chartMetricSelect');
        if (metricSelect) {
            metricSelect.addEventListener('change', e => renderChart(e.target.value));
        }
        
        // Load data through DataStore (fast - uses cache)
        await DataStore.loadData();
        
        // Render all sections immediately (all use cached data)
        renderQuickStats();
        renderChart('entries');
        renderTopPlayers();
        renderLatestEntries();
        renderRecentResults();
        
        isInitialized = true;
    }

    function refresh() {
        if (!isInitialized) return;
        
        // Re-render all sections with latest data
        renderQuickStats();
        renderChart('entries');
        renderTopPlayers();
        renderLatestEntries();
        renderRecentResults();
    }

    // Event listeners
    if (typeof AdminCore !== 'undefined') {
        AdminCore.on('pageChange', ({ page }) => {
            if (page === 'dashboard' && !isInitialized) {
                init();
            }
        });
        
        AdminCore.on('refresh', () => {
            if (AdminCore.getCurrentPage() === 'dashboard') {
                DataStore.loadData(true).then(refresh);
            }
        });
        
        AdminCore.on('dataStoreReady', () => {
            if (AdminCore.getCurrentPage() === 'dashboard') {
                refresh();
            }
        });
    }

    // Initial load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!isInitialized && (window.location.hash === '#dashboard' || window.location.hash === '')) {
                init();
            }
        });
    } else {
        if (!isInitialized && (window.location.hash === '#dashboard' || window.location.hash === '')) {
            init();
        }
    }

    return { init, refresh };
})();
