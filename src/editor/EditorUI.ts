import { EditorState } from './EditorState';

export type EditorTool = 'pen' | 'select' | 'finish' | 'bounds';

export interface EditorUICallbacks {
    onToolChange: (tool: EditorTool) => void;
    onWidthChange: (width: number) => void;
    onResampleChange: (n: number) => void;
    onPlay: () => void;
    onSave: () => void;
    onExport: () => void;
    onImport: (file: File) => void;
    onRebuildFromCenterline: () => void;
}

export class EditorUI {
    private container: HTMLElement;
    private callbacks: EditorUICallbacks;
    private currentTool: EditorTool = 'pen';

    constructor(callbacks: EditorUICallbacks) {
        this.callbacks = callbacks;
        this.injectStyles();
        this.createUI();
    }

    private injectStyles(): void {
        if (document.querySelector('style[data-editor-styles]')) {
            return;
        }

        const style = document.createElement('style');
        style.setAttribute('data-editor-styles', 'true');
        style.textContent = `
            .editor-toolbar {
                position: fixed;
                top: 10px;
                left: 10px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                background: rgba(0, 0, 0, 0.8);
                padding: 12px;
                border-radius: 8px;
                backdrop-filter: blur(4px);
                z-index: 1000;
                font-family: monospace;
                font-size: 12px;
                color: #e0e0e0;
                min-width: 200px;
            }
            
            .editor-toolbar-section {
                display: flex;
                flex-direction: column;
                gap: 4px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                padding-bottom: 8px;
                margin-bottom: 4px;
            }
            
            .editor-toolbar-section:last-child {
                border-bottom: none;
                margin-bottom: 0;
                padding-bottom: 0;
            }
            
            .editor-toolbar-row {
                display: flex;
                gap: 4px;
                align-items: center;
            }
            
            .editor-tool-btn {
                background: rgba(40, 40, 40, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                color: #e0e0e0;
                padding: 6px 12px;
                cursor: pointer;
                font-size: 11px;
                font-family: monospace;
                transition: all 0.2s;
                flex: 1;
            }
            
            .editor-tool-btn:hover {
                background: rgba(60, 60, 60, 0.9);
                border-color: rgba(255, 255, 255, 0.4);
            }
            
            .editor-tool-btn.active {
                background: rgba(0, 120, 255, 0.8);
                border-color: rgba(0, 120, 255, 1);
                color: white;
            }
            
            .editor-control {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .editor-control label {
                min-width: 60px;
                font-size: 11px;
            }
            
            .editor-control input[type="range"] {
                flex: 1;
                height: 4px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 2px;
                outline: none;
                -webkit-appearance: none;
            }
            
            .editor-control input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 12px;
                height: 12px;
                background: #0078ff;
                border-radius: 50%;
                cursor: pointer;
            }
            
            .editor-control input[type="number"] {
                width: 60px;
                background: rgba(20, 20, 20, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 3px;
                color: #e0e0e0;
                padding: 2px 6px;
                font-size: 11px;
                font-family: monospace;
            }
            
            .editor-action-btn {
                background: rgba(0, 120, 255, 0.8);
                border: 1px solid rgba(0, 120, 255, 1);
                border-radius: 4px;
                color: white;
                padding: 8px 16px;
                cursor: pointer;
                font-size: 11px;
                font-family: monospace;
                transition: all 0.2s;
                text-align: center;
            }
            
            .editor-action-btn:hover {
                background: rgba(0, 140, 255, 0.9);
            }
            
            .editor-action-btn.danger {
                background: rgba(255, 60, 60, 0.8);
                border-color: rgba(255, 60, 60, 1);
            }
            
            .editor-action-btn.danger:hover {
                background: rgba(255, 80, 80, 0.9);
            }
            
            .editor-file-input {
                display: none;
            }
            
            .editor-tooltip {
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-family: monospace;
                pointer-events: none;
                z-index: 1001;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);
    }

    private createUI(): void {
        this.container = document.createElement('div');
        this.container.className = 'editor-toolbar';
        
        // Tools section
        const toolsSection = document.createElement('div');
        toolsSection.className = 'editor-toolbar-section';
        
        const toolsRow1 = document.createElement('div');
        toolsRow1.className = 'editor-toolbar-row';
        
        const penBtn = this.createToolButton('pen', 'Pen');
        const selectBtn = this.createToolButton('select', 'Select');
        toolsRow1.appendChild(penBtn);
        toolsRow1.appendChild(selectBtn);
        
        const toolsRow2 = document.createElement('div');
        toolsRow2.className = 'editor-toolbar-row';
        
        const finishBtn = this.createToolButton('finish', 'Finish');
        const boundsBtn = this.createToolButton('bounds', 'Bounds');
        toolsRow2.appendChild(finishBtn);
        toolsRow2.appendChild(boundsBtn);
        
        toolsSection.appendChild(toolsRow1);
        toolsSection.appendChild(toolsRow2);
        
        // Controls section
        const controlsSection = document.createElement('div');
        controlsSection.className = 'editor-toolbar-section';
        
        const widthControl = this.createSliderControl('Width', 50, 300, 120, (value) => {
            this.callbacks.onWidthChange(value);
        });
        
        const resampleControl = this.createNumberControl('Resample N', 64, 2048, 256, (value) => {
            this.callbacks.onResampleChange(value);
        });
        
        controlsSection.appendChild(widthControl);
        controlsSection.appendChild(resampleControl);
        
        // Actions section
        const actionsSection = document.createElement('div');
        actionsSection.className = 'editor-toolbar-section';
        
        const playBtn = this.createActionButton('Play', () => this.callbacks.onPlay());
        const saveBtn = this.createActionButton('Save', () => this.callbacks.onSave());
        
        const fileRow = document.createElement('div');
        fileRow.className = 'editor-toolbar-row';
        
        const exportBtn = this.createActionButton('Export', () => this.callbacks.onExport());
        const importBtn = this.createActionButton('Import', () => this.triggerImport());
        fileRow.appendChild(exportBtn);
        fileRow.appendChild(importBtn);
        
        const rebuildBtn = this.createActionButton('Rebuild', () => this.callbacks.onRebuildFromCenterline(), 'danger');
        
        actionsSection.appendChild(playBtn);
        actionsSection.appendChild(saveBtn);
        actionsSection.appendChild(fileRow);
        actionsSection.appendChild(rebuildBtn);
        
        // File input for import
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.className = 'editor-file-input';
        fileInput.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                this.callbacks.onImport(file);
            }
        });
        
        this.container.appendChild(toolsSection);
        this.container.appendChild(controlsSection);
        this.container.appendChild(actionsSection);
        this.container.appendChild(fileInput);
        
        document.body.appendChild(this.container);
    }

    private createToolButton(tool: EditorTool, label: string): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'editor-tool-btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            this.setActiveTool(tool);
            this.callbacks.onToolChange(tool);
        });
        
        if (tool === this.currentTool) {
            btn.classList.add('active');
        }
        
        return btn;
    }

    private createSliderControl(label: string, min: number, max: number, defaultValue: number, onChange: (value: number) => void): HTMLElement {
        const control = document.createElement('div');
        control.className = 'editor-control';
        
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min.toString();
        slider.max = max.toString();
        slider.value = defaultValue.toString();
        
        const valueEl = document.createElement('span');
        valueEl.textContent = defaultValue.toString();
        valueEl.style.minWidth = '40px';
        valueEl.style.textAlign = 'right';
        
        slider.addEventListener('input', () => {
            const value = parseInt(slider.value);
            valueEl.textContent = value.toString();
            onChange(value);
        });
        
        control.appendChild(labelEl);
        control.appendChild(slider);
        control.appendChild(valueEl);
        
        return control;
    }

    private createNumberControl(label: string, min: number, max: number, defaultValue: number, onChange: (value: number) => void): HTMLElement {
        const control = document.createElement('div');
        control.className = 'editor-control';
        
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min.toString();
        input.max = max.toString();
        input.value = defaultValue.toString();
        
        input.addEventListener('change', () => {
            const value = Math.max(min, Math.min(max, parseInt(input.value) || defaultValue));
            input.value = value.toString();
            onChange(value);
        });
        
        control.appendChild(labelEl);
        control.appendChild(input);
        
        return control;
    }

    private createActionButton(label: string, onClick: () => void, variant?: 'danger'): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'editor-action-btn';
        if (variant) {
            btn.classList.add(variant);
        }
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        return btn;
    }

    private triggerImport(): void {
        const fileInput = this.container.querySelector('.editor-file-input') as HTMLInputElement;
        fileInput.click();
    }

    public setActiveTool(tool: EditorTool): void {
        this.currentTool = tool;
        
        const buttons = this.container.querySelectorAll('.editor-tool-btn');
        buttons.forEach((btn, index) => {
            const tools: EditorTool[] = ['pen', 'select', 'finish', 'bounds'];
            if (tools[index] === tool) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    public updateValues(state: EditorState): void {
        // Update slider values
        const widthSlider = this.container.querySelector('input[type="range"]') as HTMLInputElement;
        const widthValue = this.container.querySelector('.editor-control span') as HTMLElement;
        if (widthSlider && widthValue) {
            widthSlider.value = state.defaultWidth.toString();
            widthValue.textContent = state.defaultWidth.toString();
        }
        
        const resampleInput = this.container.querySelector('input[type="number"]') as HTMLInputElement;
        if (resampleInput) {
            resampleInput.value = state.resampleN.toString();
        }
    }

    public destroy(): void {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
