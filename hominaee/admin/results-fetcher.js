const RESULTS_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1OttNYHiecAuGG6IRX7lW6lkG5ciEcL8gp3g6lNrN9H8/export?format=csv&gid=300277644';

class ResultsFetcher {
    constructor() {
        this.results = [];
        this.lastFetchTime = null;
    }

    async fetchResults() {
        const response = await fetch(RESULTS_SHEET_CSV_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch draw results');
        }
        const csvText = await response.text();
        this.results = this.parseCSV(csvText);
        this.lastFetchTime = new Date();
        return this.results;
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(Boolean);
        const parsed = [];

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i]);
            if (row.length < 6) continue;

            const contestRaw = row[0].trim();
            const drawDateRaw = row[1].trim();
            const nums = row.slice(2, 7).map(v => parseInt(v, 10)).filter(n => !Number.isNaN(n));

            if (!contestRaw || !drawDateRaw || nums.length !== 5) continue;

            parsed.push({
                contest: contestRaw,
                drawDate: this.normalizeDate(drawDateRaw),
                winningNumbers: nums
            });
        }

        return parsed;
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current.trim());
        return values;
    }

    normalizeDate(dateStr) {
        // Accept dd/mm/yyyy or yyyy-mm-dd
        if (dateStr.includes('/')) {
            const [d, m, y] = dateStr.split('/');
            if (d && m && y) {
                return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }
        return dateStr;
    }

    getAllResults() {
        return this.results;
    }

    getResult(contest, drawDate) {
        return this.results.find(r => r.contest === contest && r.drawDate === drawDate) || null;
    }
}

// Global instance
const resultsFetcher = new ResultsFetcher();
