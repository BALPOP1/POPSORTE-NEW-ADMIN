# How to Add New Platforms

The POP-SORTE Admin Dashboard now supports dynamic platform detection and configuration. Adding a new platform is extremely simple!

## Quick Start: Adding a New Platform

### Step 1: Add Platform Configuration (ONE FILE)

Open `homina/js/admin-core.js` and find the `PLATFORM_CONFIG` object (around line 36):

```javascript
const PLATFORM_CONFIG = {
    'POPN1': {
        name: 'POPN1',
        icon: '🎰',
        prizePool: 1000,
        color: 'primary',
        title: 'POPN1 Platform'
    },
    'POPLUZ': {
        name: 'POPLUZ',
        icon: '💡',
        prizePool: 1000,
        color: 'warning',
        title: 'POPLUZ Platform'
    }
    // Add your new platform here:
};
```

### Step 2: Add Your Platform

Simply add a new entry to the `PLATFORM_CONFIG` object:

```javascript
const PLATFORM_CONFIG = {
    'POPN1': {
        name: 'POPN1',
        icon: '🎰',
        prizePool: 1000,
        color: 'primary',
        title: 'POPN1 Platform'
    },
    'POPLUZ': {
        name: 'POPLUZ',
        icon: '💡',
        prizePool: 1000,
        color: 'warning',
        title: 'POPLUZ Platform'
    },
    'POPNEW': {
        name: 'POPNEW',          // Display name
        icon: '⭐',              // Emoji icon for UI
        prizePool: 2000,         // Prize pool in R$
        color: 'success',        // CSS color class
        title: 'POPNEW Platform' // Tooltip title
    }
};
```

### That's It! 🎉

The system will automatically:
- ✅ Add the platform to the dropdown menu
- ✅ Generate the UI button with icon
- ✅ Filter data by the new platform
- ✅ Show platform-specific statistics
- ✅ Include it in the platform breakdown
- ✅ Apply the correct prize pool calculations
- ✅ Handle platform switching

## What Happens Automatically

### UI Generation
The platform switcher buttons are generated dynamically from `PLATFORM_CONFIG`. No HTML changes needed!

### Data Filtering
The `DataStore.filterByPlatform()` function works with any platform code automatically.

### Platform Detection
The system detects available platforms from your data. If entries have `platform: 'POPNEW'`, it will be recognized.

### Breakdown Statistics
The platform breakdown in the dashboard dynamically shows all detected platforms with their counts.

## Configuration Options

### Platform Config Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `name` | string | ✅ | Platform display name | `'POPNEW'` |
| `icon` | string | ✅ | Emoji icon for UI | `'⭐'` |
| `prizePool` | number | ✅ | Prize amount in R$ | `2000` |
| `color` | string | ✅ | CSS color class | `'success'`, `'primary'`, `'warning'`, `'danger'`, `'info'` |
| `title` | string | ✅ | Tooltip/title text | `'POPNEW Platform'` |

### Color Classes Available
- `primary` - Blue
- `warning` - Orange/Yellow
- `success` - Green
- `danger` - Red
- `info` - Cyan

## Data Format

Ensure your CSV data includes the platform field:

```csv
timestamp,gameId,whatsapp,numbers,contest,drawDate,status,platform
2025-01-03 14:30:00,1234567890,5511999999999,"[12,25,38,51,68]",6916,2025-01-03,VALID,POPNEW
```

## Testing New Platforms

1. Add the platform to `PLATFORM_CONFIG`
2. Refresh the admin dashboard
3. The new platform button should appear automatically
4. If you have data with that platform code, it will be detected and filtered

## Examples

### Gaming Platform
```javascript
'POPGAME': {
    name: 'POPGAME',
    icon: '🎮',
    prizePool: 1500,
    color: 'success',
    title: 'Gaming Platform'
}
```

### Premium Platform
```javascript
'POPPREMIUM': {
    name: 'PREMIUM',
    icon: '💎',
    prizePool: 5000,
    color: 'danger',
    title: 'Premium High Stakes'
}
```

### Regional Platform
```javascript
'POPSP': {
    name: 'POP-SP',
    icon: '🏙️',
    prizePool: 1200,
    color: 'info',
    title: 'São Paulo Region'
}
```

## Advanced: Platform Detection

The system can also auto-detect platforms from your data:

```javascript
// In admin-core.js
const detectedPlatforms = AdminCore.detectAvailablePlatforms(entries);
// Returns: ['ALL', 'POPN1', 'POPLUZ', 'POPNEW', ...]
```

This ensures that even if you forget to add a platform to the config, it will still appear if it exists in your data (with default styling).

## Migration from Old System

**Before (Multiple Files):**
- Update `PLATFORMS` array in `admin-core.js`
- Update `PLATFORM_PRIZES` object in `admin-core.js`
- Update HTML buttons in `index.html`
- Update `getEntriesByPlatform()` in `data-store.js`
- Total: ~10 lines across 3 files

**After (Single Entry):**
- Add one entry to `PLATFORM_CONFIG` in `admin-core.js`
- Total: ~7 lines in 1 file

**Effort Reduction: 70%** 🚀

## Troubleshooting

### Platform not showing in dropdown?
- Check that the platform code is in `PLATFORM_CONFIG`
- Refresh the page
- Check browser console for errors

### Data not filtering correctly?
- Ensure your CSV data has the correct `platform` field
- Platform codes are case-insensitive but stored as uppercase
- Default platform is `POPN1` if not specified

### Wrong prize pool?
- Check the `prizePool` value in `PLATFORM_CONFIG`
- Prize pools are per-contest, not total

## Architecture

The extensible platform system consists of:

1. **`PLATFORM_CONFIG`** - Single source of truth for platform settings
2. **Dynamic UI Generation** - `generatePlatformSwitcherUI()` creates buttons from config
3. **Platform Detection** - `detectAvailablePlatforms()` finds platforms in data
4. **Generic Filtering** - `filterByPlatform()` works with any platform code
5. **Dynamic Breakdown** - `getEntriesByPlatform()` adapts to new platforms automatically

This architecture makes the system future-proof and maintainable!

