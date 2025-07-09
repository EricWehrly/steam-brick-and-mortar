/**
 * ProgressDisplay - Manages loading progress UI
 */

export class ProgressDisplay {
  private loadingProgress: HTMLElement | null
  private progressFill: HTMLElement | null
  private progressText: HTMLElement | null
  private progressGame: HTMLElement | null
  
  constructor() {
    this.loadingProgress = document.getElementById('loading-progress')
    this.progressFill = document.getElementById('progress-fill')
    this.progressText = document.getElementById('progress-text')
    this.progressGame = document.getElementById('progress-game')
  }
  
  init(): void {
    // Initially hide progress
    this.show(false)
  }
  
  show(visible: boolean): void {
    if (!this.loadingProgress) return
    
    this.loadingProgress.style.display = visible ? 'block' : 'none'
    
    if (!visible) {
      // Reset progress when hiding
      this.update(0, 100, '')
    }
  }
  
  update(current: number, total: number, message: string, gameText: string = ''): void {
    if (!this.progressFill || !this.progressText || !this.progressGame) return
    
    const percentage = Math.max(0, Math.min(100, (current / total) * 100))
    
    this.progressFill.style.width = `${percentage}%`
    this.progressText.textContent = message
    this.progressGame.textContent = gameText
  }
}
