import { Task, GameSequence, ConnectionStatus, RenderingMode } from './types.js';
import { playerColorService } from './player-color-service.js';

// =============================================================================
// UI Controller - Handles all DOM updates and user interactions
// =============================================================================

export class RaceHUDController {
  private elements: Map<string, HTMLElement> = new Map();
  private onStepToMove?: (moveIndex: number) => void;
  private onEnterLiveMode?: () => void;

  constructor() {
    this.initializeElements();
  }

  // =============================================================================
  // Element Management
  // =============================================================================

  private initializeElements(): void {
    const elementIds = [
      // Progress bars container
      'progress-bars-container',
      // Page step slider
      'page-step-slider-container',
      'page-step-slider',
      // Player dropdowns
      'player-dropdowns-container',
      'player1-dropdown',
      'player2-dropdown'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.elements.set(id, element);
      } else {
        console.warn(`⚠️ RaceHUDController: Element not found: ${id}`);
      }
    });

    console.log(`✅ Race HUD Controller initialized with ${this.elements.size} elements`);
  }

  // =============================================================================
  // Task State Updates
  // =============================================================================

  updateTask(task: Task, steppingInfo?: {
    currentPageIndex: number;
    viewingPageIndex: number;
    renderingMode: RenderingMode;
    canStepForward: boolean;
    canStepBackward: boolean;
  }): void {
    // Update progress bars for all games (pass stepping info)
    this.updateProgressBars(task, steppingInfo);

    // Update page step slider
    this.updatePageStepSlider(task, steppingInfo);

    // Update player dropdowns
    this.updatePlayerDropdowns(task, steppingInfo);
  }

  private updateProgressBars(task: Task, steppingInfo?: {
    currentPageIndex: number;
    viewingPageIndex: number;
    renderingMode: RenderingMode;
    canStepForward: boolean;
    canStepBackward: boolean;
  }): void {
    const container = this.elements.get('progress-bars-container');
    if (!container) return;

    if (task.games.size === 0 || !task.shortestPathLength) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    // Get existing progress bars
    const existingBars = new Map<string, HTMLElement>();
    Array.from(container.children).forEach(bar => {
      const gameId = bar.getAttribute('data-game-id');
      if (gameId) {
        existingBars.set(gameId, bar as HTMLElement);
      }
    });

    // Update or create progress bars for each game
    task.games.forEach((gameSequence, gameId) => {
      const existingBar = existingBars.get(gameId);
      
      if (existingBar) {
        // Update existing progress bar (this enables smooth transitions)
        this.updateHorizontalProgressBar(
          existingBar,
          gameSequence, 
          task.shortestPathLength!, 
          gameId,
          steppingInfo
        );
        existingBars.delete(gameId); // Mark as processed
      } else {
        // Create new progress bar
        const playerColor = playerColorService.getColorForGame(gameId);
        const progressBar = this.createHorizontalProgressBar(
          gameSequence, 
          task.shortestPathLength!, 
          playerColor,
          gameId,
          steppingInfo
        );
        container.appendChild(progressBar);
      }
    });

    // Remove progress bars for games that no longer exist
    existingBars.forEach(bar => {
      bar.remove();
    });
  }

  // Utility function to find most recent page state with valid distanceToTarget
  private findMostRecentValidDistance(gameSequence: GameSequence, maxIndex: number): number | undefined {
    // Iterate backwards from maxIndex to find the most recent valid distance
    for (let i = maxIndex; i >= 0; i--) {
      const pageState = gameSequence.pageStates[i];
      if (pageState && pageState.distanceToTarget !== undefined) {
        return pageState.distanceToTarget;
      }
    }
    
    return undefined;
  }

  private createHorizontalProgressBar(
    gameSequence: GameSequence, 
    initialDistance: number, 
    color: string, 
    gameId: string,
    steppingInfo?: {
      currentPageIndex: number;
      viewingPageIndex: number;
      renderingMode: RenderingMode;
      canStepForward: boolean;
      canStepBackward: boolean;
    }
  ): HTMLElement {
    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'horizontal-progress-bar';
    progressBarContainer.setAttribute('data-game-id', gameId);

    // Determine which page state to use based on stepping mode
    let targetPageStateIndex: number;
    let currentDistance: number | undefined;

    if (steppingInfo && steppingInfo.renderingMode === 'stepping') {
      // In stepping mode, use viewing index but limit to what's available for this game
      targetPageStateIndex = Math.min(steppingInfo.viewingPageIndex, gameSequence.pageStates.length - 1);
    } else {
      // In live mode, use the most recent page state
      targetPageStateIndex = gameSequence.pageStates.length - 1;
    }

    // Get distance with fallback logic
    if (targetPageStateIndex >= 0) {
      const targetPageState = gameSequence.pageStates[targetPageStateIndex];
      currentDistance = targetPageState?.distanceToTarget;
      
      // If current distance is undefined, find the most recent valid one
      if (currentDistance === undefined) {
        currentDistance = this.findMostRecentValidDistance(gameSequence, targetPageStateIndex);
      }
    }

    // Fallback to initial distance if still no valid distance found
    if (currentDistance === undefined) {
      currentDistance = initialDistance;
    }

    // Calculate progress with baseline: start at 2%, 100% at target
    const baselinePercent = 1; // Start with 2% visible progress
    const progressRatio = (initialDistance - currentDistance) / initialDistance;
    const progressPercent = baselinePercent + (progressRatio * (100 - baselinePercent));

    // Create progress fill
    const progressFill = document.createElement('div');
    progressFill.className = 'horizontal-progress-fill';
    
    // Handle negative progress (going backwards/leftward from start)
    if (progressRatio < 0) {
      progressFill.classList.add('negative');
      
      const negativePercent = Math.abs(progressRatio) * 100;
      const negativeLeft = -negativePercent; // Push the bar leftward beyond container
      
      progressFill.style.left = `${negativeLeft}%`;
      progressFill.style.width = `${baselinePercent + negativePercent}%`;
      
      var indicatorPosition = negativeLeft;
    } else {
      // Normal positive progress
      progressFill.style.left = '0%';
      progressFill.style.width = `${Math.max(baselinePercent, progressPercent)}%`;
      
      var indicatorPosition = Math.max(baselinePercent, progressPercent);
    }
    
    progressFill.style.background = color;

    // Create player indicator (provider icon at current progress)
    const playerIndicator = document.createElement('div');
    playerIndicator.className = 'horizontal-progress-indicator';
    
    // Create and set the provider icon
    const iconImg = document.createElement('img');
    iconImg.src = playerColorService.getIconForGame(gameId);
    iconImg.alt = `${playerColorService.getDisplayName(gameId)} icon`;
    iconImg.style.width = '20px';
    iconImg.style.height = '20px';
    iconImg.style.display = 'block';
    
    playerIndicator.appendChild(iconImg);
    
    playerIndicator.style.transition = 'left 0.8s ease';
    playerIndicator.style.left = `${indicatorPosition}%`;

    // Create trophy at the end
    const trophy = document.createElement('div');
    trophy.className = 'horizontal-progress-target';
    trophy.textContent = '🏆';

    progressBarContainer.appendChild(progressFill);
    progressBarContainer.appendChild(playerIndicator);
    progressBarContainer.appendChild(trophy);

    return progressBarContainer;
  }

  private updateHorizontalProgressBar(
    progressBarContainer: HTMLElement,
    gameSequence: GameSequence, 
    initialDistance: number, 
    gameId: string,
    steppingInfo?: {
      currentPageIndex: number;
      viewingPageIndex: number;
      renderingMode: RenderingMode;
      canStepForward: boolean;
      canStepBackward: boolean;
    }
  ): void {
    // Find existing elements within the progress bar
    const progressFill = progressBarContainer.querySelector('.horizontal-progress-fill') as HTMLElement;
    const playerIndicator = progressBarContainer.querySelector('.horizontal-progress-indicator') as HTMLElement;
    
    if (!progressFill || !playerIndicator) {
      return;
    }

    // Determine which page state to use based on stepping mode (same logic as create)
    let targetPageStateIndex: number;
    let currentDistance: number | undefined;

    if (steppingInfo && steppingInfo.renderingMode === 'stepping') {
      targetPageStateIndex = Math.min(steppingInfo.viewingPageIndex, gameSequence.pageStates.length - 1);
    } else {
      targetPageStateIndex = gameSequence.pageStates.length - 1;
    }

    // Get distance with fallback logic
    if (targetPageStateIndex >= 0) {
      const targetPageState = gameSequence.pageStates[targetPageStateIndex];
      currentDistance = targetPageState?.distanceToTarget;
      
      if (currentDistance === undefined) {
        currentDistance = this.findMostRecentValidDistance(gameSequence, targetPageStateIndex);
      }
    }

    if (currentDistance === undefined) {
      currentDistance = initialDistance;
    }

    // Calculate progress (same logic as create)
    const baselinePercent = 1;
    const progressRatio = (initialDistance - currentDistance) / initialDistance;
    const progressPercent = baselinePercent + (progressRatio * (100 - baselinePercent));

    // Get player color
    const color = playerColorService.getColorForGame(gameId);

    // Update progress fill with smooth transition
    if (progressRatio < 0) {
      progressFill.classList.add('negative');
      
      const negativePercent = Math.abs(progressRatio) * 100;
      const negativeLeft = -negativePercent;
      
      progressFill.style.left = `${negativeLeft}%`;
      progressFill.style.width = `${baselinePercent + negativePercent}%`;
      
      var indicatorPosition = negativeLeft;
    } else {
      progressFill.classList.remove('negative');
      progressFill.style.left = '0%';
      progressFill.style.width = `${Math.max(baselinePercent, progressPercent)}%`;
      
      var indicatorPosition = Math.max(baselinePercent, progressPercent);
    }
    
    progressFill.style.background = color;

    // Update player indicator position with smooth transition
    playerIndicator.style.left = `${indicatorPosition}%`;
  }

  // =============================================================================
  // Player Dropdowns
  // =============================================================================

  private updatePlayerDropdowns(task: Task, steppingInfo?: {
    currentPageIndex: number;
    viewingPageIndex: number;
    renderingMode: RenderingMode;
    canStepForward: boolean;
    canStepBackward: boolean;
  }): void {
    const container = this.elements.get('player-dropdowns-container');
    if (!container) return;

    if (task.games.size === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    // Convert games map to array and assign to player dropdowns
    const gameArray = Array.from(task.games.entries());
    
    // Calculate max steps across all games for synchronization
    const maxSteps = Math.max(...gameArray.map(([, gameSequence]) => gameSequence.pageStates.length));
    
    // Update player 1 dropdown (first game)
    if (gameArray.length > 0) {
      const [gameId, gameSequence] = gameArray[0];
      this.updatePlayerDropdown('player1-dropdown', gameId, gameSequence, steppingInfo, maxSteps);
    }

    // Update player 2 dropdown (second game)
    if (gameArray.length > 1) {
      const [gameId, gameSequence] = gameArray[1];
      this.updatePlayerDropdown('player2-dropdown', gameId, gameSequence, steppingInfo, maxSteps);
    }

    // Auto-scroll both dropdowns to keep current items visible (if expanded)
    this.autoScrollToCurrentItems();
  }

  private updatePlayerDropdown(
    dropdownId: string,
    gameId: string,
    gameSequence: GameSequence,
    steppingInfo?: {
      currentPageIndex: number;
      viewingPageIndex: number;
      renderingMode: RenderingMode;
      canStepForward: boolean;
      canStepBackward: boolean;
    },
    maxSteps?: number
  ): void {
    const dropdown = this.elements.get(dropdownId);
    if (!dropdown) return;

    // Set the game ID attribute
    dropdown.setAttribute('data-game-id', gameId);

    // Get display name and icon from player color service
    const displayName = playerColorService.getDisplayName(gameId);
    const iconSrc = playerColorService.getIconForGame(gameId);

    // Update header elements
    const logoElement = dropdown.querySelector('.player-dropdown-logo') as HTMLImageElement;
    const nameElement = dropdown.querySelector('.player-dropdown-name') as HTMLElement;
    const statusElement = dropdown.querySelector('.player-dropdown-status') as HTMLElement;
    
    if (logoElement) {
      logoElement.src = iconSrc;
      logoElement.alt = `${displayName} logo`;
    }

    if (nameElement) {
      nameElement.textContent = displayName;
    }

    if (statusElement) {
      statusElement.textContent = gameSequence.status;
      statusElement.className = `player-dropdown-status ${gameSequence.status}`;
    }

    // Update dropdown list
    this.updatePlayerDropdownList(dropdown, gameSequence, steppingInfo, maxSteps);
  }

  private updatePlayerDropdownList(
    dropdown: HTMLElement,
    gameSequence: GameSequence,
    steppingInfo?: {
      currentPageIndex: number;
      viewingPageIndex: number;
      renderingMode: RenderingMode;
      canStepForward: boolean;
      canStepBackward: boolean;
    },
    maxSteps?: number
  ): void {
    const listElement = dropdown.querySelector('.player-dropdown-list') as HTMLElement;
    if (!listElement) return;

    // Clear existing items
    listElement.innerHTML = '';

    // Determine current viewing step
    let currentStep = 0;
    if (steppingInfo && steppingInfo.renderingMode === 'stepping') {
      currentStep = Math.min(steppingInfo.viewingPageIndex, gameSequence.pageStates.length - 1);
    } else {
      currentStep = gameSequence.pageStates.length - 1;
    }

    // Add items for each step (up to maxSteps, or just this game's steps if not provided)
    const totalSteps = maxSteps || gameSequence.pageStates.length;
    
    for (let index = 0; index < totalSteps; index++) {
      const item = document.createElement('div');
      item.className = 'player-dropdown-item';
      
      if (index === currentStep) {
        item.classList.add('current');
      }

      const pageState = gameSequence.pageStates[index];
      
      if (pageState) {
        // Add click handler to jump to this step (don't close dropdown)
        item.addEventListener('click', (event) => {
          event.stopPropagation(); // Prevent dropdown from closing
          if (this.onStepToMove) {
            this.onStepToMove(index);
          }
        });

        // Set border color based on distance change
        const borderColor = this.getDistanceChangeColor(pageState.distanceChange);
        item.style.borderRightColor = borderColor;

        // Create content for actual page state
        const distance = pageState.distanceToTarget !== undefined ? pageState.distanceToTarget.toString() : '?';
        item.innerHTML = `
          <span class="player-dropdown-item-index">${index}</span>
          <span class="player-dropdown-item-title">${pageState.pageTitle}</span>
          <span class="player-dropdown-item-distance">${distance}</span>
        `;
      } else {
        // Create empty placeholder for missing steps
        item.classList.add('empty');
        item.style.borderRightColor = 'transparent';
        item.innerHTML = `
          <span class="player-dropdown-item-index">${index}</span>
          <span class="player-dropdown-item-title" style="color: #6b7280; font-style: italic;">—</span>
          <span class="player-dropdown-item-distance">—</span>
        `;
      }

      listElement.appendChild(item);
    }
  }

  private getDistanceChangeColor(distanceChange?: number): string {
    if (distanceChange === undefined) {
      return '#64748b'; // Gray - unknown
    }
    
    if (distanceChange > 0) {
      return '#10b981'; // Green - got closer to target
    } else if (distanceChange === 0) {
      return '#eab308'; // Yellow - stayed same distance
    } else if (distanceChange === -1) {
      return '#ef4444'; // Red - got further from target
    } else {
      return '#dc2626'; // Dark red - got much further from target
    }
  }

  // =============================================================================
  // Event Listener Setup
  // =============================================================================

  setupEventListeners(handlers: {
    onStepToMove?: (moveIndex: number) => void;
    onEnterLiveMode?: () => void;
  }): void {
    // Store the handlers
    this.onStepToMove = handlers.onStepToMove;
    this.onEnterLiveMode = handlers.onEnterLiveMode;
    
    // Setup slider event listeners
    this.setupSliderEventListeners();

    // Setup player dropdown event listeners
    this.setupPlayerDropdownEventListeners();

    console.log('✅ UI event listeners setup');
  }

  // =============================================================================
  // Page Step Slider
  // =============================================================================

  private updatePageStepSlider(task: Task, steppingInfo?: {
    currentPageIndex: number;
    viewingPageIndex: number;
    renderingMode: RenderingMode;
    canStepForward: boolean;
    canStepBackward: boolean;
  }): void {
    const sliderContainer = this.elements.get('page-step-slider-container');
    const slider = this.elements.get('page-step-slider') as HTMLInputElement;
    
    if (!sliderContainer || !slider) return;

    // Show/hide slider based on game state
    if (task.games.size === 0 || task.currentPageIndex < 0) {
      sliderContainer.style.display = 'none';
      return;
    }

    sliderContainer.style.display = 'flex';

    // Calculate the maximum page index across all games
    const maxPageIndex = task.currentPageIndex;
    
    // Update slider properties
    slider.min = '0';
    slider.max = maxPageIndex.toString();
    slider.disabled = maxPageIndex === 0;

    // Set slider value based on viewing mode
    if (steppingInfo) {
      if (steppingInfo.renderingMode === 'live') {
        slider.value = maxPageIndex.toString();
      } else {
        slider.value = steppingInfo.viewingPageIndex.toString();
      }
    }

    // Update handle width proportionally to number of steps
    this.updateSliderHandleWidth(slider, maxPageIndex);
  }

  private updateSliderHandleWidth(slider: HTMLInputElement, maxPageIndex: number): void {
    // Calculate proportional width: if max is 0 (only 1 position), width = 100%
    // if max is 1 (2 positions), width = 50%, if max is 2 (3 positions), width = 33.33%, etc.
    const totalPositions = maxPageIndex + 1;
    const handleWidthPercent = Math.max(5, 100 / totalPositions); // Minimum 5% width for usability
    
    // Get the slider container to get its pixel width
    const container = slider.parentElement;
    if (!container) return;
    
    const containerWidth = container.offsetWidth;
    const handleWidthPx = Math.max(20, (containerWidth * handleWidthPercent) / 100); // Minimum 20px for usability
    
    // Update CSS custom property for cross-browser handle width
    slider.style.setProperty('--thumb-width', `${handleWidthPx}px`);
  }

  private setupSliderEventListeners(): void {
    const slider = this.elements.get('page-step-slider') as HTMLInputElement;
    if (!slider) return;

    // Handle slider input (dragging)
    slider.addEventListener('input', (event) => {
      const value = parseInt((event.target as HTMLInputElement).value);
      this.handleSliderChange(value, false); // false = not final
    });

    // Handle slider change (final value when user releases)
    slider.addEventListener('change', (event) => {
      const value = parseInt((event.target as HTMLInputElement).value);
      this.handleSliderChange(value, true); // true = final
    });
  }

  private setupPlayerDropdownEventListeners(): void {
    const player1Dropdown = this.elements.get('player1-dropdown');
    const player2Dropdown = this.elements.get('player2-dropdown');

    if (player1Dropdown && player2Dropdown) {
      this.setupSynchronizedDropdowns(player1Dropdown, player2Dropdown);
    }
  }

  private setupSynchronizedDropdowns(dropdown1: HTMLElement, dropdown2: HTMLElement): void {
    const header1 = dropdown1.querySelector('.player-dropdown-header');
    const header2 = dropdown2.querySelector('.player-dropdown-header');
    const content1 = dropdown1.querySelector('.player-dropdown-content') as HTMLElement;
    const content2 = dropdown2.querySelector('.player-dropdown-content') as HTMLElement;

    if (!header1 || !header2 || !content1 || !content2) return;

    // Synchronized expansion/collapse
    const toggleBoth = (clickedDropdown: HTMLElement, otherDropdown: HTMLElement) => {
      const wasExpanded = clickedDropdown.classList.contains('expanded');
      
      // Toggle both dropdowns
      clickedDropdown.classList.toggle('expanded');
      otherDropdown.classList.toggle('expanded');
      
      // If opening, scroll both to selected items
      if (!wasExpanded && clickedDropdown.classList.contains('expanded')) {
        setTimeout(() => {
          this.scrollToSelectedItem(clickedDropdown);
          this.scrollToSelectedItem(otherDropdown);
        }, 100);
      }
    };

    // Make headers clickable
    header1.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleBoth(dropdown1, dropdown2);
    });

    header2.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleBoth(dropdown2, dropdown1);
    });

    // Synchronized scrolling
    let isScrolling1 = false;
    let isScrolling2 = false;

    content1.addEventListener('scroll', () => {
      if (isScrolling2) return; // Prevent infinite loop
      isScrolling1 = true;
      content2.scrollTop = content1.scrollTop;
      setTimeout(() => { isScrolling1 = false; }, 10);
    });

    content2.addEventListener('scroll', () => {
      if (isScrolling1) return; // Prevent infinite loop
      isScrolling2 = true;
      content1.scrollTop = content2.scrollTop;
      setTimeout(() => { isScrolling2 = false; }, 10);
    });

    // Close both dropdowns when clicking outside
    document.addEventListener('click', (event) => {
      if (!dropdown1.contains(event.target as Node) && !dropdown2.contains(event.target as Node)) {
        dropdown1.classList.remove('expanded');
        dropdown2.classList.remove('expanded');
      }
    });
  }

  private scrollToSelectedItem(dropdown: HTMLElement): void {
    const content = dropdown.querySelector('.player-dropdown-content') as HTMLElement;
    const selectedItem = dropdown.querySelector('.player-dropdown-item.current') as HTMLElement;
    
    if (!content || !selectedItem) return;

    // Calculate if selected item is visible
    const contentRect = content.getBoundingClientRect();
    const selectedRect = selectedItem.getBoundingClientRect();
    
    // Check if item is fully visible within the content area
    const isVisible = selectedRect.top >= contentRect.top && 
                     selectedRect.bottom <= contentRect.bottom;
    
    if (!isVisible) {
      // Scroll to center the selected item
      const selectedOffsetTop = selectedItem.offsetTop;
      const contentHeight = content.clientHeight;
      const selectedHeight = selectedItem.offsetHeight;
      
      const targetScrollTop = selectedOffsetTop - (contentHeight / 2) + (selectedHeight / 2);
      content.scrollTop = Math.max(0, targetScrollTop);
    }
  }

  private autoScrollToCurrentItems(): void {
    const player1Dropdown = this.elements.get('player1-dropdown');
    const player2Dropdown = this.elements.get('player2-dropdown');
    
    // Only auto-scroll if at least one dropdown is expanded
    const player1Expanded = player1Dropdown?.classList.contains('expanded');
    const player2Expanded = player2Dropdown?.classList.contains('expanded');
    
    if (player1Expanded || player2Expanded) {
      // Small delay to ensure DOM updates are complete
      setTimeout(() => {
        if (player1Dropdown && player1Expanded) {
          this.scrollToSelectedItem(player1Dropdown);
        }
        if (player2Dropdown && player2Expanded) {
          this.scrollToSelectedItem(player2Dropdown);
        }
      }, 50);
    }
  }

  private handleSliderChange(pageIndex: number, isFinal: boolean): void {
    // Get current max page index to determine if we're at the end
    const slider = this.elements.get('page-step-slider') as HTMLInputElement;
    if (!slider) return;

    const maxPageIndex = parseInt(slider.max);

    if (pageIndex === maxPageIndex && isFinal) {
      // User dragged to the far right - enter live mode
      if (this.onEnterLiveMode) {
        this.onEnterLiveMode();
      }
    } else {
      // User is stepping to a specific page
      if (this.onStepToMove) {
        this.onStepToMove(pageIndex);
      }
    }
  }

  // =============================================================================
  // Utility Methods
  // =============================================================================

  resetTaskUI(): void {
    
    // Hide progress bars
    const progressContainer = this.elements.get('progress-bars-container');
    if (progressContainer) {
      progressContainer.style.display = 'none';
      progressContainer.innerHTML = '';
    }

    // Hide player dropdowns
    const dropdownsContainer = this.elements.get('player-dropdowns-container');
    if (dropdownsContainer) {
      dropdownsContainer.style.display = 'none';
    }
  }

  // For debugging
  debugElements(): void {
    console.log('🐛 UI Elements:', Array.from(this.elements.keys()));
  }
} 