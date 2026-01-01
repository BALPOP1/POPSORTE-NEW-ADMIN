/**
 * POP-SORTE Admin Dashboard - Winners Page Module
 * 
 * This module renders the winners page with:
 * - Summary stat cards (5/4/3/2/1 acertos)
 * - Ticket creators comparison chart (Today vs Yesterday)
 * - Filters: Contest, Draw Date, Prize Level, WhatsApp
 * - Winners table with color-coded matched numbers
 * - CSV export
 * 
 * Dependencies: AdminCore, DataFetcher, ResultsFetcher, WinnerCalculator, AdminCharts
 */

// ============================================
// Winners Page Module
// ============================================
window.WinnersPage = (function() {
    'use strict';

    // ============================================
    // State
    // ============================================
    let isInitialized = false;
    let currentData = {
        entries: [],
        results: [],
        calculation: null
    };
    let allWinners = [];
    let filteredWinners = [];
    let filters = {
        contest: '',
        drawDate: '',
        prizeLevel: 'all',
        whatsapp: ''
    };

    // ============================================
    // HTML Templates
    // ============================================
    
    function getTemplate() {
        return `
            <div class="winners-content">
                <!-- Header -->
                <div class="section-header mb-4">
                    <div>
                        <h2 class="section-title">🏆 Ganhadores</h2>
                        <p class="section-subtitle">Análise de ganhadores e estatísticas de prêmios</p>
                    </div>
                </div>

                <!-- Summary Stats -->
                <div class="stats-grid mb-4" id="winnersSummaryStats">
                    <div class="stat-card" style="border-left-color: #fbbf24;">
                        <span class="stat-label">🏆 5 acertos</span>
                        <span class="stat-value" id="stat5Matches">--</span>
                    </div>
                    <div class="stat-card" style="border-left-color: #9ca3af;">
                        <span class="stat-label">🥈 4 acertos</span>
                        <span class="stat-value" id="stat4Matches">--</span>
                    </div>
                    <div class="stat-card" style="border-left-color: #d97706;">
                        <span class="stat-label">🥉 3 acertos</span>
                        <span class="stat-value" id="stat3Matches">--</span>
                    </div>
                    <div class="stat-card info">
                        <span class="stat-label">🎯 2 acertos</span>
                        <span class="stat-value" id="stat2Matches">--</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">✨ 1 acerto</span>
                        <span class="stat-value" id="stat1Match">--</span>
                    </div>
                    <div class="stat-card success">
                        <span class="stat-label">Total Premiados</span>
                        <span class="stat-value" id="statTotalWinners">--</span>
                    </div>
                </div>

                <!-- Charts Row -->
                <div class="grid-2 mb-4">
                    <!-- Ticket Creators Comparison -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Criadores de Bilhete</h3>
                            <span class="text-muted">Hoje vs Ontem</span>
                        </div>
                        <div class="card-body">
                            <div class="chart-container" style="height: 200px;">
                                <canvas id="chartWinnersCreators"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Winners by Tier -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Distribuição por Acertos</h3>
                            <span class="text-muted">Todos os concursos</span>
                        </div>
                        <div class="card-body">
                            <div class="chart-container" style="height: 200px;">
                                <canvas id="chartWinnersTier"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="filters-row">
                    <div class="filter-group">
                        <label>Concurso</label>
                        <select id="filterWinnersContest">
                            <option value="">Todos</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Data Sorteio</label>
                        <select id="filterWinnersDrawDate">
                            <option value="">Todas</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Nível de Prêmio</label>
                        <select id="filterWinnersPrizeLevel">
                            <option value="all">Todos</option>
                            <option value="5">🏆 5 acertos</option>
                            <option value="4">🥈 4 acertos</option>
                            <option value="3">🥉 3 acertos</option>
                            <option value="2">🎯 2 acertos</option>
                            <option value="1">✨ 1 acerto</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>WhatsApp</label>
                        <input type="text" id="filterWinnersWhatsapp" placeholder="Buscar...">
                    </div>
                    <div class="filter-actions">
                        <button id="btnClearWinnersFilters" class="btn btn-secondary btn-sm">Limpar</button>
                        <button id="btnExportWinnersCSV" class="btn btn-primary btn-sm">📥 Exportar CSV</button>
                    </div>
                </div>

                <!-- Winners Table -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Lista de Ganhadores</h3>
                        <span class="badge badge-info" id="winnersCount">0 ganhadores</span>
                    </div>
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Prêmio</th>
                                    <th>Acertos</th>
                                    <th>Data/Hora</th>
                                    <th>Game ID</th>
                                    <th>WhatsApp</th>
                                    <th>Números Escolhidos</th>
                                    <th>Números Sorteados</th>
                                    <th>Acertados</th>
                                    <th>Sorteio</th>
                                    <th>Concurso</th>
                                </tr>
                            </thead>
                            <tbody id="winnersTableBody">
                                <tr><td colspan="10" class="text-center text-muted">Carregando ganhadores...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // Render Functions
    // ============================================
    
    function renderSummaryStats() {
        const { calculation } = currentData;
        if (!calculation) return;
        
        const { stats } = calculation;
        
        document.getElementById('stat5Matches').textContent = (stats.byTier[5] || 0).toLocaleString();
        document.getElementById('stat4Matches').textContent = (stats.byTier[4] || 0).toLocaleString();
        document.getElementById('stat3Matches').textContent = (stats.byTier[3] || 0).toLocaleString();
        document.getElementById('stat2Matches').textContent = (stats.byTier[2] || 0).toLocaleString();
        document.getElementById('stat1Match').textContent = (stats.byTier[1] || 0).toLocaleString();
        document.getElementById('statTotalWinners').textContent = stats.totalWinners.toLocaleString();
    }

    function renderCharts() {
        const { entries, calculation } = currentData;
        
        // Ticket creators comparison
        const now = AdminCore.getBrazilTime();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const comparison = WinnerCalculator.compareTicketCreators(entries, now, yesterday);
        
        const creatorsCanvas = document.getElementById('chartWinnersCreators');
        if (creatorsCanvas) {
            AdminCharts.createCreatorsComparisonChart(creatorsCanvas, comparison);
        }
        
        // Winners by tier chart
        if (calculation) {
            const tierCanvas = document.getElementById('chartWinnersTier');
            if (tierCanvas) {
                AdminCharts.createWinnersTierChart(tierCanvas, calculation.stats);
            }
        }
    }

    function renderFilterOptions() {
        const { entries } = currentData;
        
        // Populate contest options
        const contests = [...new Set(allWinners.map(w => w.contest).filter(Boolean))].sort((a, b) => {
            return parseInt(b, 10) - parseInt(a, 10);
        });
        
        const contestSelect = document.getElementById('filterWinnersContest');
        if (contestSelect) {
            contestSelect.innerHTML = '<option value="">Todos</option>' +
                contests.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        
        // Populate draw date options
        const drawDates = [...new Set(allWinners.map(w => w.drawDate).filter(Boolean))].sort().reverse();
        
        const drawDateSelect = document.getElementById('filterWinnersDrawDate');
        if (drawDateSelect) {
            drawDateSelect.innerHTML = '<option value="">Todas</option>' +
                drawDates.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    }

    function renderTable() {
        const tbody = document.getElementById('winnersTableBody');
        if (!tbody) return;
        
        // Update count badge
        const countBadge = document.getElementById('winnersCount');
        if (countBadge) {
            countBadge.textContent = `${filteredWinners.length} ganhador${filteredWinners.length !== 1 ? 'es' : ''}`;
        }
        
        if (filteredWinners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Nenhum ganhador encontrado</td></tr>';
            return;
        }
        
        // Get results map for winning numbers
        const resultsMap = new Map();
        currentData.results.forEach(r => {
            if (r.contest && !r.isNoDraw) {
                resultsMap.set(r.contest, r);
            }
        });
        
        tbody.innerHTML = filteredWinners.map(winner => {
            const result = resultsMap.get(winner.contest);
            const winningNumbers = result?.numbers || [];
            
            // Prize badge
            const tierInfo = WinnerCalculator.PRIZE_TIERS[winner.matches];
            let prizeBadge = '';
            if (winner.matches === 5) {
                prizeBadge = '<span class="badge" style="background: #fef3c7; color: #92400e;">🏆 Quina</span>';
            } else if (winner.matches === 4) {
                prizeBadge = '<span class="badge" style="background: #f3f4f6; color: #4b5563;">🥈 2º</span>';
            } else if (winner.matches === 3) {
                prizeBadge = '<span class="badge" style="background: #fef3c7; color: #b45309;">🥉 3º</span>';
            } else if (winner.matches === 2) {
                prizeBadge = '<span class="badge badge-info">🎯 Consolação</span>';
            } else {
                prizeBadge = '<span class="badge badge-gray">✨ Participação</span>';
            }
            
            // Chosen numbers with match highlighting
            const chosenHtml = winner.numbers.map(n => {
                const isMatch = winningNumbers.includes(n);
                const colorClass = AdminCore.getBallColorClass(n);
                const matchClass = isMatch ? 'match' : '';
                return `<span class="number-badge ${colorClass} ${matchClass}" style="width: 24px; height: 24px; font-size: 0.6rem;">${String(n).padStart(2, '0')}</span>`;
            }).join('');
            
            // Winning numbers
            const winningHtml = winningNumbers.map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width: 24px; height: 24px; font-size: 0.6rem;">${String(n).padStart(2, '0')}</span>`;
            }).join('');
            
            // Matched numbers
            const matchedHtml = (winner.matchedNumbers || []).map(n => {
                const colorClass = AdminCore.getBallColorClass(n);
                return `<span class="number-badge ${colorClass}" style="width: 24px; height: 24px; font-size: 0.6rem; box-shadow: 0 0 0 2px #10b981;">${String(n).padStart(2, '0')}</span>`;
            }).join('');
            
            // Format timestamp
            const formattedTime = winner.parsedDate
                ? AdminCore.formatBrazilDateTime(winner.parsedDate, {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : winner.timestamp;
            
            return `
                <tr>
                    <td>${prizeBadge}</td>
                    <td><strong class="text-success">${winner.matches}</strong></td>
                    <td style="font-size: 0.8rem; white-space: nowrap;">${formattedTime}</td>
                    <td><strong>${winner.gameId}</strong></td>
                    <td>${AdminCore.maskWhatsApp(winner.whatsapp)}</td>
                    <td><div class="numbers-display">${chosenHtml}</div></td>
                    <td><div class="numbers-display">${winningHtml || '-'}</div></td>
                    <td><div class="numbers-display">${matchedHtml || '-'}</div></td>
                    <td>${winner.drawDate}</td>
                    <td>${winner.contest}</td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // Filter Functions
    // ============================================
    
    function applyFilters() {
        let result = [...allWinners];
        
        // Contest filter
        if (filters.contest) {
            result = result.filter(w => w.contest === filters.contest);
        }
        
        // Draw date filter
        if (filters.drawDate) {
            result = result.filter(w => w.drawDate === filters.drawDate);
        }
        
        // Prize level filter
        if (filters.prizeLevel !== 'all') {
            const level = parseInt(filters.prizeLevel, 10);
            result = result.filter(w => w.matches === level);
        }
        
        // WhatsApp search
        if (filters.whatsapp) {
            const term = filters.whatsapp.toLowerCase();
            result = result.filter(w => 
                (w.whatsapp || '').toLowerCase().includes(term) ||
                (w.gameId || '').toLowerCase().includes(term)
            );
        }
        
        filteredWinners = result;
        renderTable();
    }

    function clearFilters() {
        filters = {
            contest: '',
            drawDate: '',
            prizeLevel: 'all',
            whatsapp: ''
        };
        
        document.getElementById('filterWinnersContest').value = '';
        document.getElementById('filterWinnersDrawDate').value = '';
        document.getElementById('filterWinnersPrizeLevel').value = 'all';
        document.getElementById('filterWinnersWhatsapp').value = '';
        
        applyFilters();
    }

    // ============================================
    // Export Functions
    // ============================================
    
    function exportCSV() {
        if (filteredWinners.length === 0) {
            AdminCore.showToast('Nenhum dado para exportar', 'warning');
            return;
        }
        
        const headers = [
            'Acertos',
            'Prêmio',
            'Data/Hora',
            'Game ID',
            'WhatsApp',
            'Números Escolhidos',
            'Números Acertados',
            'Data Sorteio',
            'Concurso',
            'Bilhete #'
        ];
        
        const rows = filteredWinners.map(winner => {
            const tierInfo = WinnerCalculator.PRIZE_TIERS[winner.matches];
            return [
                winner.matches,
                tierInfo?.name || '-',
                winner.timestamp,
                winner.gameId,
                winner.whatsapp,
                winner.numbers.join(', '),
                (winner.matchedNumbers || []).join(', '),
                winner.drawDate,
                winner.contest,
                winner.ticketNumber
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        
        const csv = [headers.join(','), ...rows].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ganhadores_${AdminCore.getBrazilDateString(new Date())}.csv`;
        link.click();
        
        AdminCore.showToast(`${filteredWinners.length} ganhadores exportados`, 'success');
    }

    // ============================================
    // Data Loading
    // ============================================
    
    async function loadData() {
        try {
            const [entries, results] = await Promise.all([
                DataFetcher.fetchEntries(),
                ResultsFetcher.fetchResults()
            ]);
            
            // Calculate all winners
            const calculation = await WinnerCalculator.calculateAllWinners(entries, results);
            
            currentData = { entries, results, calculation };
            allWinners = calculation.allWinners;
            filteredWinners = [...allWinners];
            
            renderSummaryStats();
            renderCharts();
            renderFilterOptions();
            renderTable();
            
        } catch (error) {
            console.error('Error loading winners data:', error);
            AdminCore.showToast('Erro ao carregar ganhadores', 'error');
        }
    }

    // ============================================
    // Event Handlers
    // ============================================
    
    function bindEvents() {
        // Contest filter
        document.getElementById('filterWinnersContest')?.addEventListener('change', (e) => {
            filters.contest = e.target.value;
            applyFilters();
        });
        
        // Draw date filter
        document.getElementById('filterWinnersDrawDate')?.addEventListener('change', (e) => {
            filters.drawDate = e.target.value;
            applyFilters();
        });
        
        // Prize level filter
        document.getElementById('filterWinnersPrizeLevel')?.addEventListener('change', (e) => {
            filters.prizeLevel = e.target.value;
            applyFilters();
        });
        
        // WhatsApp search
        document.getElementById('filterWinnersWhatsapp')?.addEventListener('input', (e) => {
            filters.whatsapp = e.target.value;
            applyFilters();
        });
        
        // Clear filters
        document.getElementById('btnClearWinnersFilters')?.addEventListener('click', clearFilters);
        
        // Export
        document.getElementById('btnExportWinnersCSV')?.addEventListener('click', exportCSV);
    }

    // ============================================
    // Initialization
    // ============================================
    
    function init() {
        const container = document.getElementById('page-winners');
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
            if (page === 'winners') {
                if (!isInitialized) {
                    init();
                } else {
                    refresh();
                }
            }
        });
        
        AdminCore.on('refresh', () => {
            if (AdminCore.getCurrentPage() === 'winners') {
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
        exportCSV
    };
})();

