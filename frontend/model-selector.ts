import { cyclingService } from './cycling-service.js';

interface ModelInfo {
    provider: string;
    input_cost_per_1m_tokens: number;
    output_cost_per_1m_tokens: number;
    default_settings: {
        max_tokens: number;
    };
}

interface ModelOption {
    id: string;
    provider: string;
    inputCost: number;
    outputCost: number;
    maxTokens: number;
    iconPath: string;
}

interface ModelSelectorOptions {
    placeholder?: string;
    onSelect?: (model: ModelOption) => void;
    onValidationChange?: (isValid: boolean) => void;
    getExcludedModels?: () => ModelOption[];
}

class ModelSelector {
    private input: HTMLInputElement;
    private container: HTMLElement;
    private dropdown: HTMLElement;
    private models: ModelOption[] = [];
    private filteredModels: ModelOption[] = [];
    private selectedIndex: number = -1;
    private isOpen: boolean = false;
    private options: Required<ModelSelectorOptions>;
    private currentQuery: string = '';
    private selectedModel: ModelOption | null = null;
    private otherSelectors: ModelSelector[] = [];
    private cycleCallback: ((title: string) => void) | null = null;

    constructor(input: HTMLInputElement, options: ModelSelectorOptions = {}) {
        this.input = input;
        
        // Set default options
        this.options = {
            placeholder: 'Search for a model...',
            onSelect: () => {},
            onValidationChange: () => {},
            getExcludedModels: () => [],
            ...options
        };

        this.container = this.createContainer();
        this.dropdown = this.createDropdown();
        
        this.setupInput();
        this.setupEventListeners();
        this.loadModels();
    }

    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'model-selector-container';
        
        // Insert container after the input
        this.input.parentNode?.insertBefore(container, this.input.nextSibling);
        container.appendChild(this.input);
        
        return container;
    }

    private createDropdown(): HTMLElement {
        const dropdown = document.createElement('div');
        dropdown.className = 'model-selector-dropdown';
        dropdown.style.display = 'none';
        
        this.container.appendChild(dropdown);
        return dropdown;
    }

    private setupInput(): void {
        this.input.placeholder = this.options.placeholder;
        this.input.autocomplete = 'off';
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute('aria-expanded', 'false');
        this.input.setAttribute('aria-autocomplete', 'list');
    }

    private setupEventListeners(): void {
        // Input events
        this.input.addEventListener('input', () => this.handleInput());
        this.input.addEventListener('click', this.handleInputClick.bind(this));
        this.input.addEventListener('keydown', this.handleKeydown.bind(this));
        this.input.addEventListener('focus', this.handleFocus.bind(this));
        this.input.addEventListener('blur', this.handleBlur.bind(this));

        // Global click to close dropdown
        document.addEventListener('click', this.handleDocumentClick.bind(this));
    }

    private async loadModels(): Promise<void> {
        try {
            const response = await fetch('./models.json');
            const modelsData: Record<string, ModelInfo> = await response.json();
            
            this.models = Object.entries(modelsData).map(([id, info]) => ({
                id,
                provider: info.provider,
                inputCost: info.input_cost_per_1m_tokens,
                outputCost: info.output_cost_per_1m_tokens,
                maxTokens: info.default_settings.max_tokens,
                iconPath: this.getProviderIcon(info.provider)
            }));

            this.filteredModels = [...this.models];
            this.startCycling();
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    private getProviderIcon(provider: string): string {
        const iconMap: Record<string, string> = {
            'anthropic': './assets/icons/claude-color.svg',
            'openai': './assets/icons/openai.svg',
            'google': './assets/icons/gemini-color.svg',
            'meta': './assets/icons/meta-color.svg',
            'random': './assets/icons/dice.svg'
        };

        return iconMap[provider] || './assets/icons/question-mark.svg';
    }

    private handleInput(openDropdown = true): void {
        const query = this.input.value;
        this.currentQuery = query;

        // Stop cycling when user starts typing
        if (query.trim() !== '') {
            this.stopCycling();
        } else {
            this.startCycling();
        }

        // Filter models based on current input
        this.filterModels(query);
        
        // Don't reset selectedIndex here since filterModels() handles it
        
        // Open dropdown if there are results or if typing
        if (openDropdown) {
            if (this.filteredModels.length > 0 || query.length > 0) {
                this.renderModels();
                this.openDropdown();
            } else {
                this.closeDropdown();
            }
        }

        // Update validation - check if current input exactly matches a model
        const exactMatch = this.models.find(model => 
            model.id.toLowerCase() === query.toLowerCase()
        );
        
        if (exactMatch) {
            this.selectedModel = exactMatch;
            this.input.classList.add('valid');
            this.input.classList.remove('invalid');
            this.options.onValidationChange(true);
        } else if (query.trim() === '') {
            // Empty input is also valid (no selection)
            this.selectedModel = null;
            this.input.classList.remove('invalid');
            this.input.classList.add('valid');
            this.options.onValidationChange(true);
        } else {
            // Partial input - not yet valid
            this.selectedModel = null;
            this.input.classList.remove('valid');
            this.input.classList.add('invalid');
            this.options.onValidationChange(false);
        }
    }

    private handleInputClick(): void {
        // When user clicks on a selected model, clear the search to show all options
        if (this.selectedModel && this.currentQuery === '') {
            // Clear the input value so they can start fresh
            this.input.value = '';
            this.currentQuery = '';
            this.selectedModel = null;
            
            // Reset validation state
            this.input.classList.remove('invalid');
            this.input.classList.add('valid');
            this.options.onValidationChange(true);
            
            // Reset filtered models to show all available (minus excluded)
            this.filterModels('');
            
            // Refresh other selectors since this selection was cleared
            this.refreshOtherSelectors();
        }
        
        // Just open dropdown if not already open, don't close it
        if (!this.isOpen) {
            this.openDropdown();
        }
    }

    private handleKeydown(event: KeyboardEvent): void {
        if (!this.isOpen || this.filteredModels.length === 0) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.openDropdown();
            }
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredModels.length - 1);
                this.updateSelection();
                break;

            case 'ArrowUp':
                event.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                break;

            case 'Enter':
                event.preventDefault();
                // Now this will always work since we auto-select index 0
                if (this.selectedIndex >= 0) {
                    this.selectModel(this.filteredModels[this.selectedIndex]);
                }
                break;

            case 'Escape':
                event.preventDefault();
                this.closeDropdown();
                break;

            case 'Tab':
                this.closeDropdown();
                break;
        }
    }

    private handleFocus(): void {
        this.stopCycling();
        // Open dropdown when user tabs into the input (or clicks focus)
        if (!this.isOpen) {
            this.openDropdown();
        }
    }

    private handleBlur(): void {
        // Validate current input on blur
        const query = this.input.value.trim();
        if (query) {
            const exactMatch = this.models.find(model => 
                model.id.toLowerCase() === query.toLowerCase()
            );
            
            if (exactMatch) {
                this.selectModel(exactMatch);
            }
        }
        
        // If input is empty, restart cycling
        if (this.input.value.trim() === '') {
            this.startCycling();
        }

        // Delay closing to allow clicks on dropdown items
        setTimeout(() => {
            this.closeDropdown();
        }, 150);
    }

    private handleDocumentClick(event: Event): void {
        if (!this.container.contains(event.target as Node)) {
            this.closeDropdown();
        }
    }

    private filterModels(query: string): void {
        const lowercaseQuery = query.toLowerCase();
        const excludedModels = this.options.getExcludedModels().map(m => m.id);
        
        this.filteredModels = this.models.filter(model => {
            // Check if model matches search query
            const matchesQuery = model.id.toLowerCase().includes(lowercaseQuery) ||
                                model.provider.toLowerCase().includes(lowercaseQuery);
            
            // Check if model is not excluded by other selectors
            const notExcluded = !excludedModels.includes(model.id);
            
            return matchesQuery && notExcluded;
        });
        
        // Auto-select first result if there are any results
        this.selectedIndex = this.filteredModels.length > 0 ? 0 : -1;
    }

    private renderModels(): void {
        if (this.filteredModels.length === 0) {
            this.dropdown.innerHTML = `
                <div class="model-selector-no-results">
                    No models found
                </div>
            `;
            return;
        }

        const html = this.filteredModels.map((model, index) => `
            <div class="model-selector-item ${index === this.selectedIndex ? 'selected' : ''}" 
                 data-index="${index}"
                 role="option"
                 aria-selected="${index === this.selectedIndex}">
                <div class="model-selector-item-icon">
                    <img src="${model.iconPath}" alt="${model.provider}" />
                </div>
                <div class="model-selector-item-content">
                    <div class="model-selector-item-name">${this.escapeHtml(model.id)}</div>
                    <div class="model-selector-item-details">
                        <span class="model-selector-cost">$${model.inputCost.toFixed(2)}/${model.outputCost.toFixed(2)} per 1M tokens</span>
                    </div>
                </div>
            </div>
        `).join('');

        this.dropdown.innerHTML = html;

        // Add click and hover listeners to items
        this.dropdown.querySelectorAll('.model-selector-item').forEach((item, index) => {
            // Click to select
            item.addEventListener('click', () => {
                this.selectModel(this.filteredModels[index]);
            });
            
            // Hover to highlight (so Enter will select hovered item)
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.updateSelection();
            });
        });
    }

    private updateSelection(): void {
        const items = this.dropdown.querySelectorAll('.model-selector-item');
        
        items.forEach((item, index) => {
            const isSelected = index === this.selectedIndex;
            item.classList.toggle('selected', isSelected);
            item.setAttribute('aria-selected', isSelected.toString());
        });

        // Scroll selected item into view
        if (this.selectedIndex >= 0) {
            const selectedItem = items[this.selectedIndex] as HTMLElement;
            selectedItem?.scrollIntoView({ block: 'nearest' });
        }
    }

    private selectModel(model: ModelOption): void {
        this.selectedModel = model;
        this.input.value = model.id;
        this.currentQuery = ''; // Clear the search query so clicking again shows all models
        this.closeDropdown();
        
        // Add visual feedback
        this.input.classList.add('valid');
        this.input.classList.remove('invalid');
        
        // Call callbacks
        this.options.onSelect(model);
        this.options.onValidationChange(true);
        
        // Refresh other selectors to exclude this newly selected model
        this.refreshOtherSelectors();
    }

    private openDropdown(): void {
        // Use current query and filtered results instead of resetting
        if (this.currentQuery === '') {
            // If no query, filter with empty string (this applies exclusions!)
            this.filterModels('');
        }
        // Otherwise keep current filtered results
        
        this.renderModels();
        this.isOpen = true;
        this.dropdown.style.display = 'block';
        this.input.setAttribute('aria-expanded', 'true');
    }

    private closeDropdown(): void {
        this.isOpen = false;
        this.dropdown.style.display = 'none';
        this.input.setAttribute('aria-expanded', 'false');
        this.selectedIndex = -1;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Public methods
    public getValue(): string {
        return this.selectedModel?.id || '';
    }

    public getSelectedModel(): ModelOption | null {
        return this.selectedModel;
    }

    public setValue(modelId: string): void {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
            this.selectModel(model);
        }
    }

    public clear(): void {
        this.selectedModel = null;
        this.currentQuery = '';
        this.input.value = '';
        this.input.classList.remove('invalid');
        this.input.classList.add('valid');
        this.closeDropdown();
        this.options.onValidationChange(true);
        
        // Refresh other selectors when this one is cleared
        this.refreshOtherSelectors();
        
        // Restart cycling
        this.startCycling();
    }

    public destroy(): void {
        // Remove event listeners
        document.removeEventListener('click', this.handleDocumentClick);
        
        // Remove DOM elements
        this.container.remove();

        // Stop cycling
        this.stopCycling();
    }

    public validateCurrentSelection(): void {
        this.handleInput(false);
    }

    // Public method to link this selector with others for cross-filtering
    public linkWithOtherSelectors(otherSelectors: ModelSelector[]): void {
        this.otherSelectors = otherSelectors;
    }

    // Method to refresh filtering (called when other selectors change)
    public refreshFiltering(): void {
        // Re-apply current query with updated exclusions
        this.filterModels(this.currentQuery);
        
        // Re-render if dropdown is open
        if (this.isOpen) {
            this.renderModels();
        }
    }

    // Private method to refresh all linked selectors
    private refreshOtherSelectors(): void {
        this.otherSelectors.forEach(selector => {
            selector.refreshFiltering();
        });
    }

    // --- Placeholder Cycling Methods ---

    private startCycling(): void {
        if (this.cycleCallback) return;

        this.cycleCallback = (modelName: string) => {
            // Only cycle if the input is empty and not focused
            if (this.input.value.trim() === '' && document.activeElement !== this.input) {
                this.input.placeholder = modelName;
            }
        };
        cyclingService.registerModelCallback(this.cycleCallback);
    }

    private stopCycling(): void {
        if (this.cycleCallback) {
            cyclingService.unregisterModelCallback(this.cycleCallback);
            this.cycleCallback = null;
        }
        // Reset to default placeholder
        this.input.placeholder = this.options.placeholder;
    }
}

export { ModelSelector, type ModelSelectorOptions, type ModelOption, type ModelInfo }; 