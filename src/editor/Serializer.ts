import { TrackBundle, EditorState } from './EditorState';

export class Serializer {
    private static readonly STORAGE_KEY = 'customTracks';

    public static saveToLocalStorage(bundle: TrackBundle): void {
        try {
            const existing = this.loadAllFromLocalStorage();
            const updated = existing.filter(b => b.id !== bundle.id);
            updated.push(bundle);
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.error('Failed to save track to localStorage:', error);
        }
    }

    public static loadAllFromLocalStorage(): TrackBundle[] {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (!data) return [];
            
            const bundles = JSON.parse(data);
            return Array.isArray(bundles) ? bundles : [];
        } catch (error) {
            console.error('Failed to load tracks from localStorage:', error);
            return [];
        }
    }

    public static loadFromLocalStorage(id: string): TrackBundle | null {
        const bundles = this.loadAllFromLocalStorage();
        return bundles.find(b => b.id === id) || null;
    }

    public static deleteFromLocalStorage(id: string): void {
        try {
            const existing = this.loadAllFromLocalStorage();
            const filtered = existing.filter(b => b.id !== id);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
        } catch (error) {
            console.error('Failed to delete track from localStorage:', error);
        }
    }

    public static exportToFile(bundle: TrackBundle): void {
        try {
            const json = JSON.stringify(bundle, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${bundle.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export track:', error);
        }
    }

    public static async importFromFile(file: File): Promise<TrackBundle> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const json = e.target?.result as string;
                    const bundle = JSON.parse(json) as TrackBundle;
                    
                    // Validate bundle structure
                    if (!this.validateBundle(bundle)) {
                        throw new Error('Invalid track bundle format');
                    }
                    
                    // Generate new ID to avoid conflicts
                    bundle.id = 'imported_' + Math.random().toString(36).substr(2, 9);
                    bundle.updatedAt = Date.now();
                    
                    resolve(bundle);
                } catch (error) {
                    reject(new Error('Failed to parse track file: ' + error.message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }

    private static validateBundle(bundle: any): bundle is TrackBundle {
        return (
            typeof bundle === 'object' &&
            typeof bundle.version === 'number' &&
            typeof bundle.id === 'string' &&
            typeof bundle.name === 'string' &&
            typeof bundle.mapSize === 'object' &&
            typeof bundle.mapSize.width === 'number' &&
            typeof bundle.mapSize.height === 'number' &&
            Array.isArray(bundle.centerPath) &&
            typeof bundle.defaultWidth === 'number' &&
            Array.isArray(bundle.widthProfile) &&
            typeof bundle.resampleN === 'number' &&
            (bundle.applyAutoShrink === undefined || typeof bundle.applyAutoShrink === 'boolean') &&
            typeof bundle.derived === 'object' &&
            typeof bundle.createdAt === 'number' &&
            typeof bundle.updatedAt === 'number'
        );
    }

    public static createEmptyBundle(): TrackBundle {
        const now = Date.now();
        return {
            version: 1,
            id: 'custom_' + Math.random().toString(36).substr(2, 9),
            name: 'New Track',
            mapSize: { width: 5000, height: 4000 },
            background: 'starField',
            centerPath: [],
            defaultWidth: 120,
            widthProfile: [],
            resampleN: 256,
            applyAutoShrink: true,
            derived: {},
            createdAt: now,
            updatedAt: now
        };
    }
}
