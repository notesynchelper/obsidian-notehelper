// Credits go to Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes

import { createPopper, type Instance as PopperInstance } from '@popperjs/core'
import { App, type ISuggestOwner, Scope, type KeymapEventListener } from 'obsidian'
import { wrapAround } from '../util'

// Internal Obsidian API types (not publicly exposed)
interface ObsidianInternalApp extends App {
  dom: {
    appContainerEl: HTMLElement
  }
  keymap: {
    pushScope(scope: Scope): void
    popScope(scope: Scope): void
  }
}

// Type for Obsidian's DOM event delegation (internal API)
type DOMEventHandler<K extends keyof HTMLElementEventMap> = (
  this: HTMLElement,
  ev: HTMLElementEventMap[K],
  delegateTarget: HTMLElement,
) => unknown

class Suggest<T> {
  private owner: ISuggestOwner<T>
  private values: T[]
  private suggestions: HTMLDivElement[]
  private selectedItem: number
  private containerEl: HTMLElement

  // Pre-bound event handlers with proper types
  private readonly boundOnSuggestionClick: DOMEventHandler<'click'>
  private readonly boundOnSuggestionMouseover: DOMEventHandler<'mousemove'>

  constructor(owner: ISuggestOwner<T>, containerEl: HTMLElement, scope: Scope) {
    this.owner = owner
    this.containerEl = containerEl

    // Bind methods with explicit type casting
    this.boundOnSuggestionClick = (event, el) =>
      this.onSuggestionClick(event, el as HTMLDivElement)
    this.boundOnSuggestionMouseover = (event, el) =>
      this.onSuggestionMouseover(event, el as HTMLDivElement)

    containerEl.on('click', '.suggestion-item', this.boundOnSuggestionClick)
    containerEl.on(
      'mousemove',
      '.suggestion-item',
      this.boundOnSuggestionMouseover,
    )

    scope.register([], 'ArrowUp', (event) => {
      if (!event.isComposing) {
        this.setSelectedItem(this.selectedItem - 1, true)
        return false
      }
    })

    scope.register([], 'ArrowDown', (event) => {
      if (!event.isComposing) {
        this.setSelectedItem(this.selectedItem + 1, true)
        return false
      }
    })

    scope.register([], 'Enter', (event) => {
      if (!event.isComposing) {
        this.useSelectedItem(event)
        return false
      }
    })
  }

  onSuggestionClick(event: MouseEvent, el: HTMLDivElement): void {
    event.preventDefault()

    const item = this.suggestions.indexOf(el)
    this.setSelectedItem(item, false)
    this.useSelectedItem(event)
  }

  onSuggestionMouseover(_event: MouseEvent, el: HTMLDivElement): void {
    const item = this.suggestions.indexOf(el)
    this.setSelectedItem(item, false)
  }

  setSuggestions(values: T[]) {
    this.containerEl.empty()
    const suggestionEls: HTMLDivElement[] = []

    values.forEach((value) => {
      const suggestionEl = this.containerEl.createDiv('suggestion-item')
      this.owner.renderSuggestion(value, suggestionEl)
      suggestionEls.push(suggestionEl)
    })

    this.values = values
    this.suggestions = suggestionEls
    this.setSelectedItem(0, false)
  }

  useSelectedItem(event: MouseEvent | KeyboardEvent) {
    const currentValue = this.values[this.selectedItem]
    if (currentValue) {
      this.owner.selectSuggestion(currentValue, event)
    }
  }

  setSelectedItem(selectedIndex: number, scrollIntoView: boolean) {
    const normalizedIndex = wrapAround(selectedIndex, this.suggestions.length)
    const prevSelectedSuggestion = this.suggestions[this.selectedItem]
    const selectedSuggestion = this.suggestions[normalizedIndex]

    prevSelectedSuggestion?.removeClass('is-selected')
    selectedSuggestion?.addClass('is-selected')

    this.selectedItem = normalizedIndex

    if (scrollIntoView) {
      selectedSuggestion.scrollIntoView(false)
    }
  }
}

export abstract class TextInputSuggest<T> implements ISuggestOwner<T> {
  protected app: App
  protected inputEl: HTMLInputElement

  private popper: PopperInstance
  private scope: Scope
  private suggestEl: HTMLElement
  private suggest: Suggest<T>

  // Pre-bound event handlers with proper types
  private readonly boundOnInputChanged: EventListener
  private readonly boundClose: KeymapEventListener

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app
    this.inputEl = inputEl
    this.scope = new Scope()

    // Bind methods with explicit types
    this.boundOnInputChanged = () => this.onInputChanged()
    this.boundClose = () => {
      this.close()
      return false
    }

    this.suggestEl = createDiv('suggestion-container')
    const suggestion = this.suggestEl.createDiv('suggestion')
    this.suggest = new Suggest(this, suggestion, this.scope)

    this.scope.register([], 'Escape', this.boundClose)

    this.inputEl.addEventListener('input', this.boundOnInputChanged)
    this.inputEl.addEventListener('focus', this.boundOnInputChanged)
    this.inputEl.addEventListener('blur', () => this.close())
    this.suggestEl.on(
      'mousedown',
      '.suggestion-container',
      (event: MouseEvent) => {
        event.preventDefault()
      },
    )
  }

  onInputChanged(): void {
    const inputStr = this.inputEl.value
    const suggestions = this.getSuggestions(inputStr)

    if (suggestions.length > 0) {
      this.suggest.setSuggestions(suggestions)
      this.open((this.app as ObsidianInternalApp).dom.appContainerEl, this.inputEl)
    }
  }

  open(container: HTMLElement, inputEl: HTMLElement): void {
    ;(this.app as ObsidianInternalApp).keymap.pushScope(this.scope)

    container.appendChild(this.suggestEl)
    // eslint-disable-next-line obsidianmd/prefer-abstract-input-suggest -- 使用自定义 Popper.js 实现，保持兼容性
    this.popper = createPopper(inputEl, this.suggestEl, {
      placement: 'bottom-start',
      modifiers: [
        {
          name: 'sameWidth',
          enabled: true,
          fn: ({ state, instance }) => {
            // Note: positioning needs to be calculated twice -
            // first pass - positioning it according to the width of the popper
            // second pass - position it with the width bound to the reference element
            // we need to early exit to avoid an infinite loop
            const targetWidth = `${state.rects.reference.width}px`
            if (state.styles.popper.width === targetWidth) {
              return
            }
            state.styles.popper.width = targetWidth
            void instance.update()
          },
          phase: 'beforeWrite',
          requires: ['computeStyles'],
        },
      ],
    })
  }

  close(): void {
    ;(this.app as ObsidianInternalApp).keymap.popScope(this.scope)

    this.suggest.setSuggestions([])
    this.popper.destroy()
    this.suggestEl.detach()
  }

  abstract getSuggestions(inputStr: string): T[]
  abstract renderSuggestion(item: T, el: HTMLElement): void
  abstract selectSuggestion(item: T): void
}
