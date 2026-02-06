import { assert } from '../run-tests.js';
import { generateCanvasMap } from '../../js/services/map-service.js';

// Minimal mock for document and canvas so generateCanvasMap can run in Node.
function installDomMocks() {
    if (global.document && typeof global.document.createElement === 'function') {
        return;
    }

    global.document = {
        createElement: (tag) => {
            if (tag !== 'canvas') {
                throw new Error('Only canvas elements are supported in this mock');
            }

            const ctx = {
                scale: () => {},
                fillRect: () => {},
                beginPath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                stroke: () => {},
                arc: () => {},
                fill: () => {},
                strokeRect: () => {},
                fillText: () => {},
                drawImage: () => {},
                set fillStyle(_) {},
                set strokeStyle(_) {},
                set lineWidth(_) {},
                set font(_) {},
                set textAlign(_) {},
                set textBaseline(_) {}
            };

            return {
                width: 0,
                height: 0,
                getContext: () => ctx,
                toDataURL: () => 'data:image/png;base64,mock'
            };
        }
    };

    global.Image = class {
        constructor() {
            this.crossOrigin = null;
            this._src = '';
        }
        set src(value) {
            this._src = value;
            // Simulate async load
            setTimeout(() => {
                if (this.onload) this.onload();
            }, 0);
        }
    };
}

export async function testGenerateCanvasMapProducesDataUrl() {
    installDomMocks();

    const centerLat = 40;
    const centerLng = -75;
    const hotspots = [
        { lat: 40.1, lng: -75.1 },
        { lat: 39.9, lng: -74.9 }
    ];

    const dataUrl = await generateCanvasMap(centerLat, centerLng, hotspots, { width: 400, height: 200 });
    assert(typeof dataUrl === 'string', 'Expected data URL string from generateCanvasMap');
    assert(dataUrl.startsWith('data:image/png'), 'Expected PNG data URL from generateCanvasMap');
}

