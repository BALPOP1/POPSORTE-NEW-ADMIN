/**
 * POP-SORTE Admin Dashboard - Charts Module
 * 
 * This module provides Chart.js configurations and helpers for:
 * - Last 7 Days statistics chart
 * - Ticket creators comparison chart
 * - Reusable chart utilities
 * 
 * Dependencies: Chart.js (loaded via CDN), admin-core.js (AdminCore)
 */

// ============================================
// Charts Module
// ============================================
window.AdminCharts = (function() {
    'use strict';

    // ============================================
    // Chart Instances Registry
    // ============================================
    const chartInstances = {};

    // ============================================
    // Color Palette
    // ============================================
    const colors = {
        primary: '#2563eb',
        primaryLight: 'rgba(37, 99, 235, 0.1)',
        success: '#10b981',
        successLight: 'rgba(16, 185, 129, 0.1)',
        warning: '#f59e0b',
        warningLight: 'rgba(245, 158, 11, 0.1)',
        danger: '#ef4444',
        dangerLight: 'rgba(239, 68, 68, 0.1)',
        info: '#3b82f6',
        infoLight: 'rgba(59, 130, 246, 0.1)',
        gray: '#6b7280',
        grayLight: 'rgba(107, 114, 128, 0.1)'
    };

    // ============================================
    // Default Chart Options
    // ============================================
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 20,
                    font: {
                        family: "'Inter', sans-serif",
                        size: 12
                    }
                }
            },
            tooltip: {
                backgroundColor: '#1f2937',
                titleFont: {
                    family: "'Inter', sans-serif",
                    size: 13,
                    weight: '600'
                },
                bodyFont: {
                    family: "'Inter', sans-serif",
                    size: 12
                },
                padding: 12,
                cornerRadius: 8,
                displayColors: true
            }
        },
        scales: {
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    font: {
                        family: "'Inter', sans-serif",
                        size: 11
                    }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                },
                ticks: {
                    font: {
                        family: "'Inter', sans-serif",
                        size: 11
                    }
                }
            }
        }
    };

    // ============================================
    // Chart Creation Helpers
    // ============================================
    
    /**
     * Destroy existing chart if it exists
     * @param {string} chartId - Chart identifier
     */
    function destroyChart(chartId) {
        if (chartInstances[chartId]) {
            chartInstances[chartId].destroy();
            delete chartInstances[chartId];
        }
    }

    /**
     * Create or update a chart
     * @param {string} chartId - Chart identifier
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} config - Chart.js configuration
     * @returns {Chart} Chart instance
     */
    function createChart(chartId, canvas, config) {
        destroyChart(chartId);
        
        const ctx = canvas.getContext('2d');
        chartInstances[chartId] = new Chart(ctx, config);
        return chartInstances[chartId];
    }

    // ============================================
    // Last 7 Days Line Chart
    // ============================================
    
    /**
     * Create the Last 7 Days statistics chart
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object[]} dailyData - Array of daily statistics
     * @param {string} metric - Selected metric to highlight
     * @returns {Chart} Chart instance
     */
    function createLast7DaysChart(canvas, dailyData, metric = 'all') {
        // Reverse data to show oldest first
        const data = [...dailyData].reverse();
        
        const labels = data.map(d => d.displayDate);
        
        const datasets = [];
        
        // Total Entries (Tickets)
        if (metric === 'all' || metric === 'entries') {
            datasets.push({
                label: 'Total Tickets',
                data: data.map(d => d.totalEntries || 0),
                borderColor: colors.primary,
                backgroundColor: colors.primaryLight,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }
        
        // Unique Rechargers
        if (metric === 'all' || metric === 'rechargers') {
            datasets.push({
                label: 'Rechargers',
                data: data.map(d => d.totalRechargers || 0),
                borderColor: colors.success,
                backgroundColor: colors.successLight,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }
        
        // Participants
        if (metric === 'all' || metric === 'participants') {
            datasets.push({
                label: 'Participants',
                data: data.map(d => d.totalParticipants || 0),
                borderColor: colors.info,
                backgroundColor: colors.infoLight,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }
        
        // Recharged No Ticket
        if (metric === 'all' || metric === 'noTicket') {
            datasets.push({
                label: 'Recharged No Ticket',
                data: data.map(d => d.rechargedNoTicket || 0),
                borderColor: colors.warning,
                backgroundColor: colors.warningLight,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }
        
        const config = {
            type: 'line',
            data: { labels, datasets },
            options: {
                ...defaultOptions,
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        };
        
        return createChart('last7days', canvas, config);
    }

    // ============================================
    // Ticket Creators Comparison Bar Chart
    // ============================================
    
    /**
     * Create ticket creators comparison chart (Today vs Yesterday)
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} comparisonData - Comparison data
     * @returns {Chart} Chart instance
     */
    function createCreatorsComparisonChart(canvas, comparisonData) {
        const labels = [
            comparisonData.date2.displayDate,
            comparisonData.date1.displayDate
        ];
        
        const config = {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Ticket Creators',
                        data: [
                            comparisonData.date2.uniqueCreators,
                            comparisonData.date1.uniqueCreators
                        ],
                        backgroundColor: [colors.gray, colors.primary],
                        borderRadius: 6,
                        barThickness: 60
                    }
                ]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    legend: {
                        display: false
                    }
                },
                scales: {
                    ...defaultOptions.scales,
                    y: {
                        ...defaultOptions.scales.y,
                        ticks: {
                            ...defaultOptions.scales.y.ticks,
                            stepSize: 1
                        }
                    }
                }
            }
        };
        
        return createChart('creatorsComparison', canvas, config);
    }

    // ============================================
    // Winners by Tier Doughnut Chart
    // ============================================
    
    /**
     * Create winners by tier doughnut chart
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} stats - Winners statistics with byTier
     * @returns {Chart} Chart instance
     */
    function createWinnersTierChart(canvas, stats) {
        const tierColors = {
            5: '#fbbf24', // Gold
            4: '#9ca3af', // Silver
            3: '#d97706', // Bronze
            2: colors.info,
            1: colors.gray
        };
        
        const labels = [];
        const data = [];
        const backgroundColors = [];
        
        for (let tier = 5; tier >= 1; tier--) {
            const count = stats.byTier[tier] || 0;
            if (count > 0) {
                labels.push(`${tier} matches`);
                data.push(count);
                backgroundColors.push(tierColors[tier]);
            }
        }
        
        // If no winners, show empty state
        if (data.length === 0) {
            labels.push('No winners');
            data.push(1);
            backgroundColors.push('#e5e7eb');
        }
        
        const config = {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: backgroundColors,
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            usePointStyle: true,
                            padding: 16,
                            font: {
                                family: "'Inter', sans-serif",
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        ...defaultOptions.plugins.tooltip
                    }
                },
                cutout: '60%'
            }
        };
        
        return createChart('winnersTier', canvas, config);
    }

    // ============================================
    // Daily Tickets Bar Chart
    // ============================================
    
    /**
     * Create daily tickets bar chart
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object[]} dailyData - Array of daily data
     * @returns {Chart} Chart instance
     */
    function createDailyTicketsChart(canvas, dailyData) {
        const data = [...dailyData].reverse();
        
        const config = {
            type: 'bar',
            data: {
                labels: data.map(d => d.displayDate),
                datasets: [{
                    label: 'Tickets Created',
                    data: data.map(d => d.totalTickets || 0),
                    backgroundColor: colors.primary,
                    borderRadius: 4,
                    barThickness: 32
                }]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    legend: {
                        display: false
                    }
                }
            }
        };
        
        return createChart('dailyTickets', canvas, config);
    }

    // ============================================
    // Participation Rate Chart
    // ============================================
    
    /**
     * Create participation rate gauge chart
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {number} rate - Participation rate percentage
     * @returns {Chart} Chart instance
     */
    function createParticipationGauge(canvas, rate) {
        const remaining = Math.max(0, 100 - rate);
        
        const config = {
            type: 'doughnut',
            data: {
                labels: ['Participation', 'No participation'],
                datasets: [{
                    data: [rate, remaining],
                    backgroundColor: [colors.success, '#e5e7eb'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                rotation: -90,
                circumference: 180,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                cutout: '75%'
            }
        };
        
        return createChart('participationGauge', canvas, config);
    }

    // ============================================
    // Utility Functions
    // ============================================
    
    /**
     * Update chart data without recreating
     * @param {string} chartId - Chart identifier
     * @param {Object} newData - New data object
     */
    function updateChartData(chartId, newData) {
        const chart = chartInstances[chartId];
        if (chart) {
            chart.data = newData;
            chart.update();
        }
    }

    /**
     * Get chart instance by ID
     * @param {string} chartId - Chart identifier
     * @returns {Chart|null} Chart instance or null
     */
    function getChart(chartId) {
        return chartInstances[chartId] || null;
    }

    /**
     * Destroy all charts
     */
    function destroyAllCharts() {
        Object.keys(chartInstances).forEach(destroyChart);
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Chart creation
        createLast7DaysChart,
        createCreatorsComparisonChart,
        createWinnersTierChart,
        createDailyTicketsChart,
        createParticipationGauge,
        
        // Utilities
        createChart,
        destroyChart,
        destroyAllCharts,
        updateChartData,
        getChart,
        
        // Constants
        colors,
        defaultOptions
    };
})();

