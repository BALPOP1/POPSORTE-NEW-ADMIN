/**
 * POP-SORTE Admin Dashboard - Winner Calculator Module
 * 
 * This module handles:
 * - Matching entries against winning numbers
 * - Filtering for valid entries only
 * - Counting matches (1-5)
 * - Prize calculation: R$1000 split among highest tier per contest
 * 
 * Prize Tiers:
 * - 5 matches: Grand Prize
 * - 4 matches: 2nd Prize (only if no 5-match winners)
 * - 3 matches: 3rd Prize (only if no 4+ match winners)
 * - 2 matches: Consolation (only if no 3+ match winners)
 * 
 * Dependencies: admin-core.js (AdminCore), data-fetcher.js (DataFetcher), results-fetcher.js (ResultsFetcher)
 */

// ============================================
// Winner Calculator Module
// ============================================
window.WinnerCalculator = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    
    /**
     * Total prize pool per contest (R$)
     */
    const PRIZE_POOL = 1000;
    
    /**
     * Minimum matches to qualify as a winner
     */
    const MIN_MATCHES_TO_WIN = 2;
    
    /**
     * Valid entry statuses
     */
    const VALID_STATUSES = ['VALID', 'VALIDADO', 'VALIDATED'];
    
    /**
     * Prize tier names
     */
    const PRIZE_TIERS = {
        5: { name: 'Quina', emoji: '🏆', label: '5 acertos' },
        4: { name: '2º Prêmio', emoji: '🥈', label: '4 acertos' },
        3: { name: '3º Prêmio', emoji: '🥉', label: '3 acertos' },
        2: { name: 'Consolação', emoji: '🎯', label: '2 acertos' },
        1: { name: 'Participação', emoji: '✨', label: '1 acerto' }
    };

    // ============================================
    // Match Calculation
    // ============================================
    
    /**
     * Count how many numbers match between entry and winning numbers
     * @param {number[]} entryNumbers - Numbers chosen by player
     * @param {number[]} winningNumbers - Official winning numbers
     * @returns {Object} Match result with count and matched numbers
     */
    function countMatches(entryNumbers, winningNumbers) {
        const matched = entryNumbers.filter(n => winningNumbers.includes(n));
        return {
            count: matched.length,
            matchedNumbers: matched.sort((a, b) => a - b)
        };
    }

    /**
     * Check if an entry has a valid status for winner consideration
     * @param {Object} entry - Entry object
     * @returns {boolean} True if valid
     */
    function isValidEntry(entry) {
        const status = (entry.status || '').toUpperCase();
        return VALID_STATUSES.includes(status);
    }

    // ============================================
    // Winner Calculation
    // ============================================
    
    /**
     * Calculate winners for a single contest
     * @param {Object[]} entries - Entries for this contest
     * @param {Object} result - Result object with winning numbers
     * @returns {Object} Winners calculation result
     */
    function calculateContestWinners(entries, result) {
        if (!result || result.isNoDraw || result.numbers.length !== 5) {
            return {
                contest: result?.contest || 'Unknown',
                drawDate: result?.drawDate || '',
                winningNumbers: [],
                hasResult: false,
                totalEntries: entries.length,
                winners: [],
                byTier: {},
                prizePerWinner: 0,
                winningTier: 0
            };
        }
        
        const winningNumbers = result.numbers;
        const winners = [];
        const byTier = { 5: [], 4: [], 3: [], 2: [], 1: [] };
        
        // Process each entry
        entries.forEach(entry => {
            if (!entry.numbers || entry.numbers.length === 0) return;
            
            const matchResult = countMatches(entry.numbers, winningNumbers);
            
            if (matchResult.count > 0) {
                const winner = {
                    ...entry,
                    matches: matchResult.count,
                    matchedNumbers: matchResult.matchedNumbers,
                    isValidEntry: isValidEntry(entry)
                };
                
                // Add to tier
                if (byTier[matchResult.count]) {
                    byTier[matchResult.count].push(winner);
                }
                
                // Only add to winners list if valid and qualifies
                if (winner.isValidEntry && matchResult.count >= MIN_MATCHES_TO_WIN) {
                    winners.push(winner);
                }
            }
        });
        
        // Sort winners by matches descending
        winners.sort((a, b) => b.matches - a.matches);
        
        // Determine winning tier (highest tier with valid winners)
        let winningTier = 0;
        for (let tier = 5; tier >= MIN_MATCHES_TO_WIN; tier--) {
            const validWinners = byTier[tier].filter(w => w.isValidEntry);
            if (validWinners.length > 0) {
                winningTier = tier;
                break;
            }
        }
        
        // Calculate prize per winner
        let prizePerWinner = 0;
        if (winningTier > 0) {
            const tierWinners = byTier[winningTier].filter(w => w.isValidEntry);
            if (tierWinners.length > 0) {
                prizePerWinner = PRIZE_POOL / tierWinners.length;
            }
        }
        
        return {
            contest: result.contest,
            drawDate: result.drawDate,
            winningNumbers: winningNumbers,
            hasResult: true,
            totalEntries: entries.length,
            validEntries: entries.filter(isValidEntry).length,
            winners: winners,
            byTier: byTier,
            winningTier: winningTier,
            prizePerWinner: prizePerWinner,
            tierInfo: PRIZE_TIERS[winningTier] || null
        };
    }

    /**
     * Calculate winners for all contests
     * @param {Object[]} entries - All entries
     * @param {Object[]} results - All results
     * @returns {Object} Complete winners calculation
     */
    async function calculateAllWinners(entries, results) {
        // Group entries by contest
        const entriesByContest = DataFetcher.groupEntriesByContest(entries);
        
        // Create results lookup map
        const resultsMap = new Map();
        results.forEach(r => {
            if (r.contest) {
                resultsMap.set(r.contest, r);
            }
        });
        
        // Calculate winners for each contest
        const contestResults = [];
        const allWinners = [];
        const stats = {
            totalContests: 0,
            contestsWithWinners: 0,
            byTier: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            totalWinners: 0,
            totalPrizeAwarded: 0
        };
        
        for (const [contest, contestEntries] of Object.entries(entriesByContest)) {
            const result = resultsMap.get(contest);
            const contestWinners = calculateContestWinners(contestEntries, result);
            
            contestResults.push(contestWinners);
            
            if (contestWinners.hasResult) {
                stats.totalContests++;
                
                if (contestWinners.winningTier > 0) {
                    stats.contestsWithWinners++;
                    stats.totalPrizeAwarded += PRIZE_POOL;
                }
                
                // Count by tier (only valid entries)
                for (let tier = 5; tier >= 1; tier--) {
                    const validInTier = contestWinners.byTier[tier].filter(w => w.isValidEntry);
                    stats.byTier[tier] += validInTier.length;
                }
                
                // Add winners to all winners list
                allWinners.push(...contestWinners.winners);
            }
        }
        
        stats.totalWinners = allWinners.length;
        
        // Sort contest results by contest number descending
        contestResults.sort((a, b) => {
            const numA = parseInt(a.contest, 10) || 0;
            const numB = parseInt(b.contest, 10) || 0;
            return numB - numA;
        });
        
        return {
            contestResults,
            allWinners,
            stats
        };
    }

    // ============================================
    // Winner Statistics
    // ============================================
    
    /**
     * Get summary statistics for winners
     * @param {Object[]} entries - All entries
     * @param {Object[]} results - All results
     * @returns {Object} Summary stats
     */
    async function getWinnerStats(entries, results) {
        const calculation = await calculateAllWinners(entries, results);
        
        return {
            ...calculation.stats,
            winRate: entries.length > 0 
                ? ((calculation.stats.totalWinners / entries.length) * 100).toFixed(2)
                : 0
        };
    }

    /**
     * Get winners for a specific contest
     * @param {string} contest - Contest number
     * @param {Object[]} entries - All entries
     * @param {Object[]} results - All results
     * @returns {Object} Contest winners
     */
    async function getContestWinners(contest, entries, results) {
        const contestEntries = entries.filter(e => e.contest === contest);
        const result = results.find(r => r.contest === contest);
        
        return calculateContestWinners(contestEntries, result);
    }

    /**
     * Get top winners (by match count)
     * @param {Object[]} entries - All entries
     * @param {Object[]} results - All results
     * @param {number} limit - Max number to return
     * @returns {Object[]} Top winners
     */
    async function getTopWinners(entries, results, limit = 10) {
        const calculation = await calculateAllWinners(entries, results);
        
        return calculation.allWinners
            .sort((a, b) => {
                // Sort by matches desc, then by date desc
                if (b.matches !== a.matches) {
                    return b.matches - a.matches;
                }
                const timeA = a.parsedDate ? a.parsedDate.getTime() : 0;
                const timeB = b.parsedDate ? b.parsedDate.getTime() : 0;
                return timeB - timeA;
            })
            .slice(0, limit);
    }

    /**
     * Get winners grouped by player (game ID)
     * @param {Object[]} allWinners - All winner entries
     * @returns {Object[]} Players with their wins
     */
    function groupWinnersByPlayer(allWinners) {
        const playerWins = {};
        
        allWinners.forEach(winner => {
            if (!winner.gameId) return;
            
            if (!playerWins[winner.gameId]) {
                playerWins[winner.gameId] = {
                    gameId: winner.gameId,
                    whatsapp: winner.whatsapp,
                    totalWins: 0,
                    bestMatch: 0,
                    wins: []
                };
            }
            
            const player = playerWins[winner.gameId];
            player.totalWins++;
            player.bestMatch = Math.max(player.bestMatch, winner.matches);
            player.wins.push(winner);
        });
        
        return Object.values(playerWins)
            .sort((a, b) => {
                if (b.bestMatch !== a.bestMatch) {
                    return b.bestMatch - a.bestMatch;
                }
                return b.totalWins - a.totalWins;
            });
    }

    // ============================================
    // Ticket Creators Comparison
    // ============================================
    
    /**
     * Compare ticket creators between two dates
     * @param {Object[]} entries - All entries
     * @param {Date} date1 - First date
     * @param {Date} date2 - Second date
     * @returns {Object} Comparison data
     */
    function compareTicketCreators(entries, date1, date2) {
        const dateStr1 = AdminCore.getBrazilDateString(date1);
        const dateStr2 = AdminCore.getBrazilDateString(date2);
        
        const entries1 = entries.filter(e => {
            if (!e.parsedDate) return false;
            return AdminCore.getBrazilDateString(e.parsedDate) === dateStr1;
        });
        
        const entries2 = entries.filter(e => {
            if (!e.parsedDate) return false;
            return AdminCore.getBrazilDateString(e.parsedDate) === dateStr2;
        });
        
        const creators1 = new Set(entries1.map(e => e.gameId).filter(Boolean));
        const creators2 = new Set(entries2.map(e => e.gameId).filter(Boolean));
        
        return {
            date1: {
                date: dateStr1,
                displayDate: AdminCore.formatBrazilDateTime(date1, { 
                    day: '2-digit', 
                    month: '2-digit',
                    weekday: 'short'
                }),
                uniqueCreators: creators1.size,
                totalTickets: entries1.length
            },
            date2: {
                date: dateStr2,
                displayDate: AdminCore.formatBrazilDateTime(date2, { 
                    day: '2-digit', 
                    month: '2-digit',
                    weekday: 'short'
                }),
                uniqueCreators: creators2.size,
                totalTickets: entries2.length
            },
            change: creators1.size - creators2.size,
            changePercent: creators2.size > 0 
                ? (((creators1.size - creators2.size) / creators2.size) * 100).toFixed(1)
                : 0
        };
    }

    /**
     * Get ticket creators for last N days
     * @param {Object[]} entries - All entries
     * @param {number} days - Number of days
     * @returns {Object[]} Daily creator counts
     */
    function getTicketCreatorsByDay(entries, days = 7) {
        const dailyData = [];
        const now = AdminCore.getBrazilTime();
        
        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = AdminCore.getBrazilDateString(date);
            
            const dayEntries = entries.filter(e => {
                if (!e.parsedDate) return false;
                return AdminCore.getBrazilDateString(e.parsedDate) === dateStr;
            });
            
            const creators = new Set(dayEntries.map(e => e.gameId).filter(Boolean));
            
            dailyData.push({
                date: dateStr,
                displayDate: AdminCore.formatBrazilDateTime(date, { 
                    day: '2-digit', 
                    month: '2-digit'
                }),
                weekday: AdminCore.formatBrazilDateTime(date, { weekday: 'short' }),
                uniqueCreators: creators.size,
                totalTickets: dayEntries.length
            });
        }
        
        return dailyData;
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Calculation
        countMatches,
        isValidEntry,
        calculateContestWinners,
        calculateAllWinners,
        
        // Statistics
        getWinnerStats,
        getContestWinners,
        getTopWinners,
        groupWinnersByPlayer,
        
        // Comparisons
        compareTicketCreators,
        getTicketCreatorsByDay,
        
        // Constants
        PRIZE_POOL,
        MIN_MATCHES_TO_WIN,
        VALID_STATUSES,
        PRIZE_TIERS
    };
})();

