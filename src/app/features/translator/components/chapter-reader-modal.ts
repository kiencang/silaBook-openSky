import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { BookStore, Chapter } from '../../../core/book.store';
import { ReaderStore } from '../../../core/reader.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chapter-reader-modal',
  imports: [MatIconModule],
  host: {
    '(window:resize)': 'onResize()',
  },
  template: `
    @if (mode() === 'fullscreen') {
      <div
        class="fixed inset-0 z-50 overflow-y-auto transition-colors duration-300"
        [style.background-color]="getContainerBg(readerStore.prefs().theme)"
      >
        <div class="max-w-3xl mx-auto px-6 py-12 relative min-h-screen">
          <div
            class="fixed top-1/2 -translate-y-1/2 left-4 transition-transform duration-300 z-50 flex-col items-center hidden md:flex"
            [class.-translate-x-[calc(100%+1rem)]]="!readerStore.prefs().isToolbarExpanded"
          >
            <!-- Toggle Button -->
            <button
              (click)="toggleToolbar()"
              class="absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-center rounded-r-md border-y border-r shadow-sm transition-colors duration-300 cursor-pointer"
              [class]="getToolbarClass(readerStore.prefs().theme)"
              [title]="readerStore.prefs().isToolbarExpanded ? 'Ẩn công cụ' : 'Hiện công cụ'"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px] flex items-center justify-center">{{
                readerStore.prefs().isToolbarExpanded ? 'chevron_left' : 'chevron_right'
              }}</mat-icon>
            </button>

            <div
              class="flex flex-col items-center gap-2 p-1.5 rounded-full shadow border transition-colors duration-300 w-11"
              [class]="getToolbarClass(readerStore.prefs().theme)"
            >
              <div class="flex flex-col gap-1 items-center">
                <button
                  (click)="changeFontSize(2)"
                  class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors font-medium text-[16px] leading-none text-center"
                  title="Tăng cỡ chữ"
                >
                  A+
                </button>
                <button
                  (click)="changeFontSize(-2)"
                  class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors font-medium text-[12px] leading-none text-center"
                  title="Giảm cỡ chữ"
                >
                  A-
                </button>
              </div>

              <div class="w-6 h-[1px] bg-current opacity-20"></div>

              <div class="flex flex-col gap-1 w-8">
                <button
                  (click)="changeFontFamily('Inter')"
                  class="w-full h-8 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs font-medium tracking-tight"
                  [class.font-bold]="readerStore.prefs().fontFamily === 'Inter'"
                  [class.ring-1]="readerStore.prefs().fontFamily === 'Inter'"
                  style="font-family: 'Inter';"
                  title="Font Inter"
                >
                  In
                </button>
                <button
                  (click)="changeFontFamily('Lora')"
                  class="w-full h-8 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs font-medium tracking-tight"
                  [class.font-bold]="readerStore.prefs().fontFamily === 'Lora'"
                  [class.ring-1]="readerStore.prefs().fontFamily === 'Lora'"
                  style="font-family: 'Lora', serif;"
                  title="Font Lora"
                >
                  Lo
                </button>
                <button
                  (click)="changeFontFamily('Lexend')"
                  class="w-full h-8 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs font-medium tracking-tight"
                  [class.font-bold]="readerStore.prefs().fontFamily === 'Lexend'"
                  [class.ring-1]="readerStore.prefs().fontFamily === 'Lexend'"
                  style="font-family: 'Lexend', sans-serif;"
                  title="Font Lexend"
                >
                  Le
                </button>
              </div>

              <div class="w-6 h-[1px] bg-current opacity-20"></div>

              <div class="flex flex-col gap-2 pt-1 pb-1">
                <button
                  (click)="changeTheme('white')"
                  class="w-5 h-5 rounded-full border shadow-inner transition-transform hover:scale-110"
                  [class.ring-2]="readerStore.prefs().theme === 'white'"
                  [class.ring-offset-2]="readerStore.prefs().theme === 'white'"
                  [style.ring-offset-color]="getContainerBg(readerStore.prefs().theme)"
                  style="background-color: #FFFFFF; border-color: #E5E7EB;"
                  title="Nền trắng"
                ></button>
                <button
                  (click)="changeTheme('sepia')"
                  class="w-5 h-5 rounded-full border shadow-inner transition-transform hover:scale-110"
                  [class.ring-2]="readerStore.prefs().theme === 'sepia'"
                  [class.ring-offset-2]="readerStore.prefs().theme === 'sepia'"
                  [style.ring-offset-color]="getContainerBg(readerStore.prefs().theme)"
                  style="background-color: #FFFFF0; border-color: #E5E7EB;"
                  title="Nền ngà"
                ></button>
                <button
                  (click)="changeTheme('dark')"
                  class="w-5 h-5 rounded-full border shadow-inner transition-transform hover:scale-110"
                  [class.ring-2]="readerStore.prefs().theme === 'dark'"
                  [class.ring-offset-2]="readerStore.prefs().theme === 'dark'"
                  [style.ring-offset-color]="getContainerBg(readerStore.prefs().theme)"
                  style="background-color: #121212; border-color: #374151;"
                  title="Nền tối"
                ></button>
              </div>

              <div class="w-6 h-[1px] bg-current opacity-20"></div>

              <button
                (click)="resetPrefs()"
                class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title="Khôi phục mặc định"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px] flex items-center justify-center"
                  >refresh</mat-icon
                >
              </button>
            </div>
          </div>

          <!-- Close button -->
          <button
            (click)="closeModal.emit()"
            class="fixed top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full shadow-sm transition-colors backdrop-blur-sm z-50 cursor-pointer"
            [class]="getCloseBtnClass(readerStore.prefs().theme)"
            title="Đóng chế độ toàn màn hình"
          >
            <mat-icon>close</mat-icon>
          </button>

          <div
            class="prose max-w-none transition-all duration-300 leading-relaxed"
            [class]="getContentClass(readerStore.prefs().theme)"
            [style.font-size.px]="readerStore.prefs().fontSize"
            [style.font-family]="getFontFamily(readerStore.prefs().fontFamily)"
            [innerHTML]="parsedTranslatedHtml()"
          ></div>

          <div
            class="mt-24 pt-8 border-t border-zinc-200/50 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl mx-auto pb-12"
          >
            @if (prevTranslatedChapterIndex() !== -1) {
              <button
                (click)="navigateTo(prevTranslatedChapterIndex())"
                class="flex items-center gap-2 px-6 py-3 rounded-full bg-white/50 hover:bg-white/80 dark:bg-zinc-800/50 dark:hover:bg-zinc-800/80 transition-colors shadow-sm text-sm font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 w-full sm:w-auto justify-center"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">arrow_back</mat-icon>
                Phần trước
              </button>
            } @else {
              <div class="hidden sm:block"></div>
            }

            @if (nextTranslatedChapterIndex() !== -1) {
              <button
                (click)="navigateTo(nextTranslatedChapterIndex())"
                class="flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 transition-colors shadow-sm text-sm font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 w-full sm:w-auto justify-center"
              >
                Phần sau
                <mat-icon class="!w-5 !h-5 !text-[20px] leading-none">arrow_forward</mat-icon>
              </button>
            } @else {
              <div class="hidden sm:block"></div>
            }
          </div>
        </div>
      </div>
    }

    @if (mode() === 'bilingual') {
      <div
        class="fixed inset-0 z-50 overflow-hidden flex flex-col transition-colors duration-300 bilingual-fullscreen-container"
        [style.background-color]="getContainerBg(readerStore.prefs().theme)"
      >
        <!-- Header -->
        <div
          class="h-16 flex items-center justify-between px-6 shadow-sm z-10 flex-shrink-0"
          [class]="getToolbarClass(readerStore.prefs().theme)"
        >
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-full p-1">
                <button
                  (click)="changeFontSize(-2)"
                  class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 dark:hover:bg-black/20 transition-colors font-medium text-[12px] opacity-80 hover:opacity-100"
                >
                  A-
                </button>
                <button
                  (click)="changeFontSize(2)"
                  class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 dark:hover:bg-black/20 transition-colors font-medium text-[16px] opacity-80 hover:opacity-100"
                >
                  A+
                </button>
              </div>
              <div class="w-[1px] h-6 bg-current opacity-20"></div>
              <div class="flex gap-2">
                <button
                  (click)="changeTheme('white')"
                  class="w-6 h-6 rounded-full border shadow-inner transition-transform hover:scale-110"
                  [class.ring-2]="readerStore.prefs().theme === 'white'"
                  style="background-color: #FFFFFF; border-color: #E5E7EB;"
                  title="Nền trắng"
                ></button>
                <button
                  (click)="changeTheme('sepia')"
                  class="w-6 h-6 rounded-full border shadow-inner transition-transform hover:scale-110"
                  [class.ring-2]="readerStore.prefs().theme === 'sepia'"
                  style="background-color: #FFFFF0; border-color: #E5E7EB;"
                  title="Nền ngà"
                ></button>
                <button
                  (click)="changeTheme('dark')"
                  class="w-6 h-6 rounded-full border shadow-inner transition-transform hover:scale-110"
                  [class.ring-2]="readerStore.prefs().theme === 'dark'"
                  style="background-color: #121212; border-color: #374151;"
                  title="Nền tối"
                ></button>
              </div>
            </div>

            <div class="w-[1px] h-6 bg-current opacity-20"></div>

            <div>
              <span class="font-semibold text-[15px] opacity-90">{{
                chapter().title || 'Phần ' + (index() + 1)
              }}</span>
              <span
                class="text-[11px] opacity-70 ml-2 font-medium tracking-wider uppercase border border-current rounded px-1.5 py-0.5"
                >Song ngữ</span
              >
            </div>
          </div>

          <div class="flex items-center gap-4">
            <button
              (click)="closeModal.emit()"
              class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="Đóng chế độ song ngữ"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Content columns -->
        <div
          class="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-zinc-200/50 dark:divide-zinc-800/50"
        >
          <!-- Original Column -->
          <div
            tabindex="0"
            (keydown.enter)="onBilingualContentClick($event, 'original')"
            class="overflow-y-auto px-8 lg:px-16 py-12 scroll-smooth"
            (click)="onBilingualContentClick($event, 'original')"
          >
            <div class="max-w-2xl mx-auto">
              <h4
                class="text-xs font-semibold uppercase tracking-wider mb-8 opacity-40 text-center flex items-center justify-center gap-2"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">g_translate</mat-icon> Bản gốc
                @if (isBilingualAligned()) {
                  <mat-icon
                    class="!w-4 !h-4 !text-[16px] text-green-500 ml-2"
                    title="Đồng bộ tự động"
                    aria-label="Aligned"
                    >swap_horiz</mat-icon
                  >
                }
              </h4>
              <div
                class="prose max-w-none transition-all duration-300 leading-relaxed prose-original cursor-pointer group"
                [class]="getContentClass(readerStore.prefs().theme)"
                [style.font-size.px]="readerStore.prefs().fontSize"
                [style.font-family]="getFontFamily(readerStore.prefs().fontFamily)"
                [innerHTML]="parsedOriginalHtml()"
              ></div>
            </div>
          </div>

          <!-- Translated Column -->
          <div
            tabindex="0"
            (keydown.enter)="onBilingualContentClick($event, 'translated')"
            class="overflow-y-auto px-8 lg:px-16 py-12 scroll-smooth bg-black/[0.02] dark:bg-white/[0.02]"
            (click)="onBilingualContentClick($event, 'translated')"
          >
            <div class="max-w-2xl mx-auto">
              <h4
                class="text-xs font-semibold uppercase tracking-wider mb-8 opacity-40 text-center flex items-center justify-center gap-2"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">translate</mat-icon> Bản dịch
                @if (isBilingualAligned()) {
                  <mat-icon
                    class="!w-4 !h-4 !text-[16px] text-green-500 ml-2"
                    title="Đồng bộ tự động"
                    aria-label="Aligned"
                    >swap_horiz</mat-icon
                  >
                }
              </h4>
              <div
                class="prose max-w-none transition-all duration-300 leading-relaxed prose-translated cursor-pointer group"
                [class]="getContentClass(readerStore.prefs().theme)"
                [style.font-size.px]="readerStore.prefs().fontSize"
                [style.font-family]="getFontFamily(readerStore.prefs().fontFamily)"
                [innerHTML]="parsedTranslatedHtml()"
              ></div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ChapterReaderModalComponent implements OnInit, OnDestroy {
  private static activeModalCount = 0;

  readonly store = inject(BookStore);
  readonly readerStore = inject(ReaderStore);

  readonly mode = input.required<'fullscreen' | 'bilingual'>();
  readonly chapter = input.required<Chapter>();
  readonly index = input.required<number>();
  readonly parsedOriginalHtml = input.required<SafeHtml | string>();
  readonly parsedTranslatedHtml = input.required<SafeHtml | string>();

  readonly closeModal = output<void>();
  readonly requestNavigate = output<number>();

  readonly isBilingualAligned = signal(false);

  ngOnInit() {
    ChapterReaderModalComponent.activeModalCount++;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    if (this.mode() === 'bilingual') {
      setTimeout(() => {
        this.alignBilingualBlocks();
      }, 50);
    }
  }

  ngOnDestroy() {
    ChapterReaderModalComponent.activeModalCount = Math.max(
      0,
      ChapterReaderModalComponent.activeModalCount - 1
    );
    if (typeof document !== 'undefined' && ChapterReaderModalComponent.activeModalCount === 0) {
      document.body.style.overflow = '';
    }
  }

  alignBilingualBlocks() {
    if (typeof document === 'undefined') return;
    const originalProse = document.querySelector(
      '.bilingual-fullscreen-container .prose-original'
    );
    const translatedProse = document.querySelector(
      '.bilingual-fullscreen-container .prose-translated'
    );

    if (!originalProse || !translatedProse) return;

    const selector =
      ':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > table';
    const originalBlocks = Array.from(originalProse.querySelectorAll(selector)) as HTMLElement[];
    const translatedBlocks = Array.from(
      translatedProse.querySelectorAll(selector)
    ) as HTMLElement[];

    if (originalBlocks.length !== translatedBlocks.length || originalBlocks.length === 0) {
      this.isBilingualAligned.set(false);
      return;
    }

    const tagsMatch = originalBlocks.every((el, i) => el.tagName === translatedBlocks[i].tagName);
    if (!tagsMatch) {
      this.isBilingualAligned.set(false);
      return;
    }

    this.isBilingualAligned.set(true);

    for (let i = 0; i < originalBlocks.length; i++) {
      originalBlocks[i].style.minHeight = '';
      translatedBlocks[i].style.minHeight = '';
    }
  }

  onResize() {
    if (this.mode() === 'bilingual' && this.isBilingualAligned()) {
      this.alignBilingualBlocks();
    }
  }

  onBilingualContentClick(event: Event, source: 'original' | 'translated') {
    const target = event.target as HTMLElement;
    if (target.closest('a')) return;

    const blockElement = target.closest(
      'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, table'
    ) as HTMLElement;
    if (!blockElement) return;

    const parentProse = blockElement.closest('.prose');
    if (!parentProse) return;

    const selector =
      ':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > table';
    const allBlocks = Array.from(parentProse.querySelectorAll(selector));
    const blockIdx = allBlocks.indexOf(blockElement);
    if (blockIdx === -1) return;

    const counterpartSelector = source === 'original' ? '.prose-translated' : '.prose-original';
    const counterpartProse = document.querySelector(
      `.bilingual-fullscreen-container ${counterpartSelector}`
    );
    const counterpartScrollContainer = counterpartProse?.closest(
      '.overflow-y-auto'
    ) as HTMLElement;
    const activeScrollContainer = parentProse.closest('.overflow-y-auto') as HTMLElement;

    if (counterpartProse && counterpartScrollContainer && activeScrollContainer) {
      const counterpartBlocks = Array.from(counterpartProse.querySelectorAll(selector));
      const counterpartBlock = counterpartBlocks[blockIdx] as HTMLElement;

      if (counterpartBlock) {
        if (this.isBilingualAligned()) {
          const activeBlockRect = blockElement.getBoundingClientRect();
          const activeContainerRect = activeScrollContainer.getBoundingClientRect();
          const relativeTopOffset = activeBlockRect.top - activeContainerRect.top;

          const counterpartBlockRect = counterpartBlock.getBoundingClientRect();
          const counterpartContainerRect = counterpartScrollContainer.getBoundingClientRect();
          const targetScrollTop =
            counterpartScrollContainer.scrollTop +
            (counterpartBlockRect.top - counterpartContainerRect.top) -
            relativeTopOffset;

          counterpartScrollContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
          });
        } else {
          counterpartBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  prevTranslatedChapterIndex(): number {
    const chapters = this.store.chapters();
    const prevIndex = this.index() - 1;
    if (prevIndex >= 0 && chapters[prevIndex].translatedText) {
      return prevIndex;
    }
    return -1;
  }

  nextTranslatedChapterIndex(): number {
    const chapters = this.store.chapters();
    const nextIndex = this.index() + 1;
    if (nextIndex < chapters.length && chapters[nextIndex].translatedText) {
      return nextIndex;
    }
    return -1;
  }

  navigateTo(targetIndex: number) {
    this.closeModal.emit();
    this.requestNavigate.emit(targetIndex);
  }

  changeFontSize(delta: number) {
    const current = this.readerStore.prefs().fontSize;
    this.readerStore.updatePrefs({ fontSize: Math.max(14, Math.min(42, current + delta)) });
  }

  changeTheme(theme: 'white' | 'sepia' | 'dark') {
    this.readerStore.updatePrefs({ theme });
  }

  changeFontFamily(fontFamily: 'Inter' | 'Lora' | 'Lexend') {
    this.readerStore.updatePrefs({ fontFamily });
  }

  resetPrefs() {
    this.readerStore.resetPrefs();
  }

  toggleToolbar() {
    this.readerStore.updatePrefs({
      isToolbarExpanded: !this.readerStore.prefs().isToolbarExpanded,
    });
  }

  getContainerBg(theme: string) {
    switch (theme) {
      case 'dark':
        return '#121212';
      case 'white':
        return '#FFFFFF';
      case 'sepia':
      default:
        return '#FFFFF0';
    }
  }

  getCloseBtnClass(theme: string) {
    switch (theme) {
      case 'dark':
        return 'bg-zinc-800/90 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:bg-zinc-700/90';
      case 'white':
        return 'bg-zinc-100/90 text-zinc-500 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-200/90';
      case 'sepia':
      default:
        return 'bg-[#EAE4D3]/90 text-[#8C7A6B] hover:text-[#4A3C31] border border-[#DED6C1] hover:bg-[#DED6C1]/90';
    }
  }

  getToolbarClass(theme: string) {
    switch (theme) {
      case 'dark':
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
      case 'white':
        return 'bg-zinc-100 text-zinc-600 border-zinc-200';
      case 'sepia':
      default:
        return 'bg-[#F3EFE0] text-[#5C4D3C] border-[#E8DFC8]';
    }
  }

  getContentClass(theme: string) {
    switch (theme) {
      case 'dark':
        return 'prose-invert prose-p:text-zinc-300 prose-headings:text-zinc-100 prose-strong:text-zinc-200 prose-blockquote:text-zinc-400';
      case 'white':
        return 'prose-p:text-zinc-800 prose-headings:text-zinc-900';
      case 'sepia':
      default:
        return 'prose-p:text-[#333333] prose-headings:text-[#111111] prose-blockquote:text-[#555555]';
    }
  }

  getFontFamily(font: string) {
    switch (font) {
      case 'Lora':
        return "'Lora', serif";
      case 'Lexend':
        return "'Lexend', sans-serif";
      case 'Inter':
      default:
        return "'Inter', sans-serif";
    }
  }
}
