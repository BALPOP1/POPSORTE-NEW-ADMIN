/**
 * POP-SORTE Admin Dashboard - Results Page Module
 * 
 * This module renders the contest results page with:
 * - Read-only table from Results sheet
 * - Columns: Contest, Draw Date, Winning Numbers, Saved At, Source
 * - Search and filter functionality
 * 
 * Dependencies: AdminCore, ResultsFetcher
 */

// ============================================
// Results Page Module
// ============================================
window.ResultsPage = (function() {
    'use strict';

    // ============================================
    // State
    // ============================================
    let isInitialized = false;
    let results = [];
    let filteredResults = [];
    let searchTerm = '';

    // ============================================
    // HTML Templates
    // ============================================
    
    function getTemplate() {
        return `
            <div class="results-content">
                <!-- Header -->
                <div class="section-header mb-4">
                    <div>
                        <h2 class="section-title">🎯 Resultados dos Concursos</h2>
                        <p class="section-subtitle">Resultados oficiais da Quina (somente leitura)</p>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid mb-4">
                    <div class="stat-card primary">
                        <span class="stat-label">Total de Resultados</span>
                        <span class="stat-value" id="statTotalResults">--</span>
                    </div>
                    <div class="stat-card success">
                        <span class="stat-label">Sorteios Válidos</span>
                        <span class="stat-value" id="statValidDraws">--</span>
                    </div>
                    <div class="stat-card warning">
                        <span class="stat-label">Sem Sorteio</span>
                        <span class="stat-value" id="statNoDraws">--</span>
                    </div>
                    <div class="stat-card info">
                        <span class="stat-label">Último Resultado</span>
                        <span class="stat-value" id="statLatestContest">--</span>
                    </div>
                </div>

                <!-- Latest Result Card -->
                <div class="card mb-4" id="latestResultCard" style="display: none;">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">🎱 Último Resultado</h3>
                            <span class="text-muted" id="latestResultDate">--</span>
                        </div>
                        <span class="badge badge-success" id="latestResultContest">--</span>
                    </div>
                    <div class="card-body">
                        <div class="numbers-display" id="latestResultNumbers" style="justify-content: center;">
                            <!-- Numbers will be rendered here -->
                        </div>
                    </div>
                </div>

                <!-- Search -->
                <div class="filters-row">
                    <div class="filter-group" style="flex: 1;">
                        <label>Buscar Concurso</label>
                        <input type="text" id="searchResults" placeholder="Digite o número do concurso...">
                    </div>
                </div>

                <!-- Results Table -->
                <div class="card">
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Concurso</th>
                                    <th>Data do Sorteio</th>
                                    <th>Números Sorteados</th>
                                    <th>Salvo Em</th>
                                    <th>Fonte</th>
                                </tr>
                            </thead>
                            <tbody id="resultsTableBody">
                                <tr><td colspan="5" class="text-center text-muted">Carregando resultados...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Info -->
                <div class="mt-4 text-center text-muted" style="font-size: 0.85rem;">
                    <p>📢 Os resultados são obtidos do sorteio oficial da Quina.</p>
                    <p>Fonte: <a href="https://loterias.caixa.gov.br" target="_blank">loterias.caixa.gov.br</a></p>
                </div>
            </div>
        `;
    }

    // ============================================
    // Render Functions
    // ============================================
    
    function renderStats() {
        const total = results.length;
        const validDraws = results.filter(r => !r.isNoDraw).length;
        const noDraws = results.filter(r => r.isNoDraw).length;
        
        document.getElementById('statTotalResults').textContent = total.toLocaleString();
        document.getElementById('statValidDraws').textContent = validDraws.toLocaleString();
        document.getElementById('statNoDraws').textContent = noDraws.toLocaleString();
        
        // Latest contest
        const latest = results.find(r => !r.isNoDraw);
        if (latest) {
            document.getElementById('statLatestContest').textContent = `#${latest.contest}`;
        }
    }

    function renderLatestResult() {
        const card = document.getElementById('latestResultCard');
        const latest = results.find(r => !r.isNoDraw);
        
        if (!latest || !card) {
            if (card) card.style.display = 'none';
            return;
        }
        
        card.style.display = 'block';
        
        document.getElementById('latestResultContest').textContent = `Concurso #${latest.contest}`;
        document.getElementById('latestResultDate').textContent = latest.drawDate;
        
        const numbersContainer = document.getElementById('latestResultNumbers');
        numbersContainer.innerHTML = latest.numbers.map(n => {
            const colorClass = AdminCore.getBallColorClass(n);
            return `<span class="number-badge ${colorClass}" style="width: 48px; height: 48px; font-size: 1.1rem;">${String(n).padStart(2, '0')}</span>`;
        }).join('');
    }

    function renderTable() {
        const tbody = document.getElementById('resultsTableBody');
        if (!tbody) return;
        
        if (filteredResults.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum resultado encontrado</td></tr>';
            return;
        }
        
        tbody.innerHTML = filteredResults.map(result => {
            // Numbers
            let numbersHtml = '';
            if (result.isNoDraw) {
                numbersHtml = '<span class="badge badge-warning">Sem Sorteio</span>';
            } else {
                numbersHtml = result.numbers.map(n => {
                    const colorClass = AdminCore.getBallColorClass(n);
                    return `<span class="number-badge ${colorClass}" style="width: 28px; height: 28px; font-size: 0.7rem;">${String(n).padStart(2, '0')}</span>`;
                }).join('');
            }
            
            // Source badge
            let sourceBadge = '';
            const source = (result.source || '').toLowerCase();
            if (source.includes('caixa')) {
                sourceBadge = '<span class="badge badge-success">Caixa</span>';
            } else if (source.includes('api')) {
                sourceBadge = '<span class="badge badge-info">API</span>';
            } else if (source) {
                sourceBadge = `<span class="badge badge-gray">${result.source}</span>`;
            } else {
                sourceBadge = '<span class="badge badge-gray">Manual</span>';
            }
            
            return `
                <tr>
                    <td><strong>#${result.contest}</strong></td>
                    <td>${result.drawDate || '-'}</td>
                    <td><div class="numbers-display">${numbersHtml}</div></td>
                    <td style="font-size: 0.8rem;">${result.savedAt || '-'}</td>
                    <td>${sourceBadge}</td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // Search Function
    // ============================================
    
    function applySearch() {
        if (!searchTerm) {
            filteredResults = [...results];
        } else {
            const term = searchTerm.toLowerCase();
            filteredResults = results.filter(r => 
                r.contest.toLowerCase().includes(term) ||
                (r.drawDate || '').toLowerCase().includes(term)
            );
        }
        renderTable();
    }

    // ============================================
    // Data Loading
    // ============================================
    
    async function loadData() {
        try {
            results = await ResultsFetcher.fetchResults();
            filteredResults = [...results];
            
            renderStats();
            renderLatestResult();
            renderTable();
            
        } catch (error) {
            console.error('Error loading results:', error);
            AdminCore.showToast('Erro ao carregar resultados', 'error');
            
            const tbody = document.getElementById('resultsTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar dados</td></tr>';
            }
        }
    }

    // ============================================
    // Event Handlers
    // ============================================
    
    function bindEvents() {
        const searchInput = document.getElementById('searchResults');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                applySearch();
            });
        }
    }

    // ============================================
    // Initialization
    // ============================================
    
    function init() {
        const container = document.getElementById('page-results');
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
            if (page === 'results') {
                if (!isInitialized) {
                    init();
                } else {
                    refresh();
                }
            }
        });
        
        AdminCore.on('refresh', () => {
            if (AdminCore.getCurrentPage() === 'results') {
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
        loadData
    };
})();

