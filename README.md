# Birding Hotspots Finder

A web-based tool to discover the best birding locations near any address. Enter where you're staying and generate a PDF report of nearby birding hotspots with species lists, maps, and directions.

## Features

- **Address or GPS Input**: Enter any address or GPS coordinates to find birding hotspots within 31 miles
- **Current Location**: Use your device's GPS to automatically detect your location
- **Flexible Sorting**: Sort hotspots by most species observed or by closest distance
- **PDF Report Generation**: Download a comprehensive PDF report including:
  - Visual map showing all hotspot locations
  - Species count for each hotspot (last 30 days)
  - Navigation-friendly addresses for each hotspot
  - Google Maps directions links
  - QR codes linking to eBird hotspot pages
  - Complete bird species lists with rare/notable species highlighted
- **Saved Locations**: Save frequently-used starting locations for quick access
- **Notable Species**: Rare and uncommon species are automatically highlighted

## Getting Started

### Prerequisites

You'll need a free eBird API key to use this tool:

1. Visit [eBird API Key Generator](https://ebird.org/api/keygen)
2. Sign in with your eBird account (or create one for free)
3. Generate your API key
4. Copy the key for use in the application

### Using the Tool

1. **Open the Application**: Visit the hosted page on GitHub Pages or open `index.html` locally
2. **Enter Your Location**:
   - Type an address in the address field, OR
   - Enter GPS coordinates (latitude/longitude), OR
   - Click "Use My Current Location" to use your device's GPS
3. **Enter Your API Key**: Paste your eBird API key (optionally check "Remember" to save it)
4. **Choose Sorting Method**:
   - **Most Species**: Prioritizes hotspots with the highest bird diversity
   - **Closest Distance**: Prioritizes hotspots nearest to your location
5. **Generate Report**: Click the button to create and download your PDF report

### Saving Favorite Locations

1. Enter a location (address or coordinates)
2. Click "Save Current Location"
3. Give it a name (e.g., "Home", "Beach House", "Cabin")
4. Click saved locations anytime to quickly use them

## Deployment

This is a static web application that can be hosted on any web server, including GitHub Pages.

### GitHub Pages Deployment

1. Fork or clone this repository
2. Go to repository Settings > Pages
3. Select the branch to deploy (usually `main`)
4. Your site will be available at `https://yourusername.github.io/repository-name`

### Local Development

Simply open `index.html` in a modern web browser. No build process or server required.

**Note**: Some browsers may restrict certain features (like geolocation) when running from `file://`. For full functionality, serve the files using a local HTTP server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve
```

Then visit `http://localhost:8000`

## Technical Details

### APIs Used

- **eBird API v2**: Bird observation data from Cornell Lab of Ornithology
- **Google Maps Geocoding API**: Address geocoding and reverse geocoding for accurate location resolution

### Libraries

- **jsPDF**: Client-side PDF generation
- **QRCode.js**: QR code generation for hotspot links
- **Leaflet**: Interactive map preview with OpenStreetMap tiles

### Browser Compatibility

Works in all modern browsers:
- Chrome/Edge 80+
- Firefox 75+
- Safari 13+

Requires JavaScript enabled and an internet connection for API calls.

## Privacy

- Your eBird API key is stored only in your browser's localStorage (if you choose "Remember")
- Location data is sent only to eBird and OpenStreetMap for API queries
- No data is collected or stored on any server

## Data Attribution

Bird observation data provided by [eBird](https://ebird.org), a project of the Cornell Lab of Ornithology. Maps and geocoding powered by [OpenStreetMap](https://www.openstreetmap.org) contributors.

## Non-Commercial Use

This is a free, open-source tool intended for personal, non-commercial use only. It is designed for educational purposes and personal birding trip planning. The application does not generate revenue and is not affiliated with or endorsed by Cornell Lab of Ornithology or eBird. Use of eBird data accessed through this tool is subject to the [eBird Data Access Terms of Use](https://www.birds.cornell.edu/home/ebird-data-access-terms-of-use/).

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
