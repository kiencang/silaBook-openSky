import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BookStore, Chapter, TranslationVersion } from '../../../core/book.store';
import { ToastService } from '../../../core/toast.service';
import { getConfiguredMarked } from '../../../core/marked-setup';
import { getCustomEconomyModels, OpenRouterClient, isPromptLoadError, parseOpenRouterError } from '../../../core/openrouter';
import { ChapterReaderModalComponent } from './chapter-reader-modal';
import {
  ChapterVersionModalsComponent,
  SnapshotModalState,
} from './chapter-version-modals';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-translating-skeleton',
  imports: [MatIconModule],
  template: `
    <div
      class="flex flex-col items-center justify-start pt-12 min-h-[400px] h-full w-full relative overflow-hidden"
    >
      <div class="absolute inset-0 p-6 pointer-events-none opacity-[0.15]">
        <div class="space-y-4 w-full mx-auto">
          <div class="h-3 bg-zinc-400 rounded w-3/4 animate-pulse"></div>
          <div class="h-3 bg-zinc-400 rounded animate-pulse" style="animation-delay: 200ms"></div>
          <div class="h-3 bg-zinc-400 rounded animate-pulse" style="animation-delay: 400ms"></div>
          <div class="h-3 bg-zinc-400 rounded w-5/6 animate-pulse" style="animation-delay: 600ms"></div>
          <div class="h-3 bg-zinc-400 rounded w-full animate-pulse" style="animation-delay: 800ms"></div>
          <div class="h-3 bg-zinc-400 rounded w-2/3 animate-pulse" style="animation-delay: 1000ms"></div>
        </div>
        <div class="space-y-4 w-full mx-auto mt-8">
          <div class="h-3 bg-zinc-400 rounded animate-pulse" style="animation-delay: 300ms"></div>
          <div class="h-3 bg-zinc-400 rounded w-4/5 animate-pulse" style="animation-delay: 500ms"></div>
          <div class="h-3 bg-zinc-400 rounded w-full animate-pulse" style="animation-delay: 700ms"></div>
          <div class="h-3 bg-zinc-400 rounded w-3/4 animate-pulse" style="animation-delay: 900ms"></div>
        </div>
        <div class="space-y-4 w-full mx-auto mt-8">
          <div class="h-3 bg-zinc-400 rounded w-1/2 animate-pulse" style="animation-delay: 400ms"></div>
        </div>
      </div>

      <div
        class="relative z-10 flex flex-col items-center bg-white/90 p-8 rounded-2xl shadow-sm backdrop-blur-sm border border-indigo-100 min-w-[240px]"
      >
        <mat-icon
          class="animate-spin mb-4 text-indigo-600 !w-8 !h-8 !text-[32px] flex items-center justify-center"
          >sync</mat-icon
        >
        <div
          class="text-sm font-semibold text-indigo-600 tracking-wider uppercase bg-indigo-50 px-4 py-2 rounded-full shadow-sm"
        >
          Đang dịch...
        </div>
      </div>
    </div>
  `,
})
export class TranslatingSkeletonComponent {}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chapter-item',
  imports: [
    MatIconModule,
    DatePipe,
    TranslatingSkeletonComponent,
    ChapterReaderModalComponent,
    ChapterVersionModalsComponent,
  ],
  host: {
    class: 'block',
    '(click)': 'onLinkClick($event)',
  },
  template: `
    <div class="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
      <div
        class="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 cursor-pointer"
        (click)="toggleExpand()"
        tabindex="0"
        (keydown.enter)="toggleExpand()"
      >
        <div class="flex items-center space-x-3 w-full">
          <mat-icon class="text-zinc-400 transition-transform" [class.rotate-90]="isExpanded()"
            >chevron_right</mat-icon
          >
          <div class="flex-1">
            <h4 class="font-semibold text-zinc-900">
              {{ chapter().title || 'Phần ' + (index() + 1) }}
            </h4>
            <div class="flex items-center space-x-3 mt-1">
              <span class="text-xs text-zinc-500 font-mono">{{ chapter().wordCount }} từ</span>
              <span class="w-1 h-1 rounded-full bg-zinc-300"></span>
              @switch (chapter().status) {
                @case ('pending') {
                  <span class="text-xs font-medium text-zinc-500 bg-zinc-200 px-2 rounded-full py-0.5"
                    >Chờ dịch</span
                  >
                }
                @case ('translating') {
                  <span
                    class="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 px-2 rounded-full py-0.5"
                  >
                    <span class="flex items-center gap-1 animate-pulse">
                      <mat-icon class="!w-3 !h-3 !text-[12px] animate-spin">sync</mat-icon> Đang
                      dịch...
                    </span>
                    <span class="w-[1px] h-3 bg-indigo-300"></span>
                    <span class="font-mono tracking-tight">{{ formatTime(elapsedSeconds()) }}</span>
                  </span>
                }
                @case ('done') {
                  <span
                    class="text-xs font-medium text-green-700 bg-green-100 px-2 rounded-full py-0.5"
                    >Đã dịch</span
                  >
                }
                @case ('error') {
                  <span class="text-xs font-medium text-red-700 bg-red-100 px-2 rounded-full py-0.5"
                    >Lỗi</span
                  >
                }
              }
            </div>
          </div>
        </div>
        <div class="flex items-center space-x-2 shrink-0 ml-4">
          @if (chapter().status !== 'translating') {
            <button
              (click)="translateSingle.emit(); $event.stopPropagation()"
              [disabled]="store.isTranslatingAny() || chapter().excludeFromTranslation"
              [class.opacity-50]="store.isTranslatingAny() || chapter().excludeFromTranslation"
              [class.cursor-not-allowed]="
                store.isTranslatingAny() || chapter().excludeFromTranslation
              "
              class="px-3 py-1.5 bg-white text-indigo-500 hover:bg-indigo-50 border border-indigo-100 hover:border-indigo-200 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm disabled:hover:bg-white disabled:hover:border-indigo-100"
              [title]="
                chapter().excludeFromTranslation
                  ? 'Không thể dịch khối này'
                  : chapter().status === 'done' || chapter().status === 'error'
                    ? 'Dịch lại riêng phần này'
                    : 'Dịch riêng phần này'
              "
            >
              <mat-icon class="!w-4 !h-4 !text-base flex items-center justify-center"
                >looks_one</mat-icon
              >
              <span class="text-sm font-medium">{{
                chapter().status === 'done' || chapter().status === 'error'
                  ? 'Dịch lại riêng phần này'
                  : 'Dịch riêng phần này'
              }}</span>
            </button>
          }
        </div>
      </div>

      @if (isExpanded()) {
        <div class="flex flex-col">
          @if (chapter().versions && chapter().versions!.length > 0) {
            <div
              class="px-6 py-3 bg-white border-b border-zinc-100 flex flex-col items-center justify-center gap-2"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-zinc-500 mr-2">Phiên bản:</span>
                @for (v of chapter().versions; track v.versionNumber) {
                  <div class="relative group">
                    <button
                      (click)="store.selectVersion(chapter().id, v.versionNumber)"
                      [class.bg-indigo-100]="chapter().activeVersionNumber === v.versionNumber"
                      [class.text-indigo-700]="chapter().activeVersionNumber === v.versionNumber"
                      [class.font-semibold]="chapter().activeVersionNumber === v.versionNumber"
                      [class.bg-zinc-100]="chapter().activeVersionNumber !== v.versionNumber"
                      [class.text-zinc-600]="chapter().activeVersionNumber !== v.versionNumber"
                      class="tooltip-trigger px-2 py-1.5 min-w-[36px] rounded-md text-xs font-medium transition-colors hover:bg-zinc-200"
                    >
                      v{{ v.versionNumber }}
                    </button>
                    @if (v.versionNumber === 1) {
                      <div
                        class="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 px-3 py-2 bg-zinc-900 text-white text-xs font-normal leading-relaxed rounded-lg shadow-lg whitespace-normal text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Đây là bản dịch đầu tiên (v1) của phần này, bạn có quyền tạo các bản dịch
                        khác để tạo các phiên bản khác của bản dịch. Ví dụ bạn có thể điều chỉnh
                        model dùng để dịch, chỉnh sửa bảng thuật ngữ rồi dịch lại phần này hoặc
                        dịch lại toàn cuốn sách. Có tối đa 3 phiên bản dịch gần nhất của mỗi phần
                        được lưu lại.
                        <span
                          class="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-900"
                        ></span>
                      </div>
                    } @else if (chapter().activeVersionNumber === v.versionNumber) {
                      <div
                        class="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 px-3 py-2 bg-zinc-900 text-white text-xs font-normal leading-relaxed rounded-lg shadow-lg whitespace-normal text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Bạn đang đọc phiên bản này, phiên bản nào được bạn chọn sẽ là phiên bản được
                        xuất ra khi tải file về, bạn có thể chọn bất cứ phiên bản nào mình muốn.
                        <span
                          class="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-900"
                        ></span>
                      </div>
                    }
                  </div>
                }
              </div>
              @if (getActiveVersion(chapter()); as activeV) {
                <div
                  class="text-[11px] text-zinc-500 flex flex-col items-center justify-center gap-y-2 bg-zinc-50 px-3 py-2 rounded-md border border-zinc-100 w-full"
                >
                  <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="!w-3.5 !h-3.5 !text-[14px] text-indigo-500"
                        >smart_toy</mat-icon
                      >
                      Model: {{ activeV.model }}
                    </span>
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="!w-3.5 !h-3.5 !text-[14px] text-green-500">schedule</mat-icon>
                      {{ activeV.timestamp | date: 'dd/MM/yy HH:mm' }}
                    </span>
                    <span class="flex items-center gap-1.5">
                      <mat-icon
                        class="!w-3.5 !h-3.5 !text-[14px]"
                        [class]="
                          activeV.translationMode === 'scientific'
                            ? 'text-purple-500'
                            : 'text-amber-500'
                        "
                      >
                        {{ activeV.translationMode === 'scientific' ? 'science' : 'g_translate' }}
                      </mat-icon>
                      Phong cách dịch:
                      {{
                        activeV.translationMode === 'scientific'
                          ? 'Khoa học, chuyên ngành'
                          : 'Truyện ngắn, tiểu thuyết'
                      }}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                    @if (activeV.glossaryStatus === 'filtered') {
                      <button
                        (click)="
                          viewCustomGlossary(
                            activeV.customGlossary,
                            activeV.glossaryRatio,
                            activeV.glossaryVersionNumber
                          )
                        "
                        class="flex items-center gap-1 text-indigo-600 hover:underline"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">menu_book</mat-icon> Sử dụng
                        danh sách thuật ngữ đã lọc (v{{ activeV.glossaryVersionNumber ?? '?' }})
                      </button>
                    } @else if (activeV.glossaryStatus === 'full') {
                      <button
                        (click)="
                          viewCustomGlossary(
                            activeV.customGlossary,
                            activeV.glossaryRatio,
                            activeV.glossaryVersionNumber
                          )
                        "
                        class="flex items-center gap-1 text-indigo-600 hover:underline"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">library_books</mat-icon> Sử
                        dụng đầy đủ danh sách thuật ngữ (v{{
                          activeV.glossaryVersionNumber ?? '?'
                        }})
                      </button>
                    } @else {
                      <span class="flex items-center gap-1 text-zinc-400">
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">book</mat-icon> Không sử dụng
                        danh sách thuật ngữ
                      </span>
                    }
                    <span class="bg-zinc-200 w-[1px] h-3 mx-0"></span>
                    @if (activeV.usePronouns) {
                      <button
                        (click)="
                          viewPronounSnapshot(
                            activeV.pronounSnapshot,
                            activeV.pronounVersionNumber
                          )
                        "
                        class="flex items-center gap-1 text-emerald-600 hover:underline"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">assignment_ind</mat-icon> Sử
                        dụng bảng đại từ (v{{ activeV.pronounVersionNumber ?? '?' }})
                      </button>
                    } @else {
                      <span class="flex items-center gap-1 text-zinc-400">
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">person_off</mat-icon> Không sử
                        dụng bảng đại từ
                      </span>
                    }
                    <span class="bg-zinc-200 w-[1px] h-3 mx-0"></span>
                    @if (activeV.useContextSummary) {
                      <button
                        (click)="
                          viewContextSummary(
                            activeV.contextSummarySnapshot,
                            activeV.contextSummaryChapterTitle
                          )
                        "
                        class="flex items-center gap-1 text-cyan-600 hover:underline"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">psychology</mat-icon> Sử dụng
                        tóm tắt ngữ cảnh
                      </button>
                    } @else {
                      <span class="flex items-center gap-1 text-zinc-400">
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">psychology_alt</mat-icon>
                        Không sử dụng tóm tắt ngữ cảnh
                      </span>
                    }
                    <span class="bg-zinc-200 w-[1px] h-3 mx-0"></span>
                    @if (activeV.summary) {
                      <button
                        (click)="viewSummary(activeV.summary)"
                        class="flex items-center gap-1 text-amber-600 hover:underline"
                        title="Xem bản tóm tắt"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">auto_awesome</mat-icon> Có tóm
                        tắt
                      </button>
                    } @else {
                      <button
                        (click)="confirmCreateSummary(activeV)"
                        [disabled]="isGeneratingSummary()"
                        class="flex items-center gap-1 text-zinc-400 hover:text-amber-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        title="Nhấp để tạo bản tóm tắt"
                      >
                        <mat-icon
                          class="!w-3.5 !h-3.5 !text-[14px]"
                          [class.animate-spin]="isGeneratingSummary()"
                          >{{ isGeneratingSummary() ? 'sync' : 'auto_awesome_mosaic' }}</mat-icon
                        >
                        {{ isGeneratingSummary() ? 'Đang tạo tóm tắt...' : 'Không có tóm tắt' }}
                      </button>
                    }
                  </div>
                  <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1">
                    @if (activeV.useCustomInstructions) {
                      <button
                        (click)="viewCustomInstructionsSnapshot(activeV.customInstructionsSnapshot)"
                        class="flex items-center gap-1 text-fuchsia-600 hover:underline"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">tune</mat-icon> Có sử dụng chỉ
                        thị bổ sung
                      </button>
                    } @else {
                      <span class="flex items-center gap-1 text-zinc-400">
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">tune</mat-icon> Không sử dụng
                        chỉ thị bổ sung
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          }

          <div
            class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-100"
          >
            <div class="p-6">
              <div class="flex items-center min-h-[28px] mb-4">
                <h5 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Bản gốc (Markdown)
                </h5>
              </div>
              <div
                class="prose prose-sm max-w-none text-zinc-700"
                [innerHTML]="parsedOriginalHtml()"
              ></div>
            </div>
            <div class="p-6 bg-zinc-50 relative">
              <div class="flex items-center justify-between min-h-[28px] mb-4">
                <h5 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Bản dịch
                </h5>
                @if (chapter().translatedText) {
                  <div class="flex items-center gap-1.5">
                    <div class="relative group">
                      <button
                        (click)="store.exportChapterToEpub(chapter(), index())"
                        class="tooltip-trigger flex items-center justify-center p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px]">menu_book</mat-icon>
                      </button>
                      <div
                        class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Tải xuống EPUB
                        <span
                          class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"
                        ></span>
                      </div>
                    </div>
                    <div class="relative group">
                      <button
                        (click)="store.exportChapterToDocx(chapter(), index())"
                        class="tooltip-trigger flex items-center justify-center p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px]">description</mat-icon>
                      </button>
                      <div
                        class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Tải xuống DOCX
                        <span
                          class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"
                        ></span>
                      </div>
                    </div>
                    <div class="relative group">
                      <button
                        (click)="store.exportChapterToPdf(chapter(), index())"
                        class="tooltip-trigger flex items-center justify-center p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px]">picture_as_pdf</mat-icon>
                      </button>
                      <div
                        class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Tải xuống PDF
                        <span
                          class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"
                        ></span>
                      </div>
                    </div>
                    <div class="relative group">
                      <button
                        (click)="store.exportChapterToHtml(chapter(), index())"
                        class="tooltip-trigger flex items-center justify-center p-1.5 text-zinc-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px]">html</mat-icon>
                      </button>
                      <div
                        class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Tải xuống HTML
                        <span
                          class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"
                        ></span>
                      </div>
                    </div>
                    <span class="w-px h-4 bg-zinc-200 mx-0.5"></span>
                    <div class="relative group">
                      <button
                        (click)="readerMode.set('bilingual')"
                        class="tooltip-trigger flex items-center justify-center p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px]">vertical_split</mat-icon>
                      </button>
                      <div
                        class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Đọc song ngữ
                        <span
                          class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"
                        ></span>
                      </div>
                    </div>
                    <div class="relative group">
                      <button
                        (click)="readerMode.set('fullscreen')"
                        class="tooltip-trigger flex items-center justify-center p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px]">fullscreen</mat-icon>
                      </button>
                      <div
                        class="pointer-events-none absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg shadow-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-30"
                      >
                        Đọc toàn màn hình
                        <span
                          class="absolute top-full right-2.5 border-4 border-transparent border-t-zinc-900"
                        ></span>
                      </div>
                    </div>
                  </div>
                }
              </div>
              @if (chapter().excludeFromTranslation) {
                <div
                  class="flex items-center justify-center py-12 px-6 text-center text-zinc-500 bg-zinc-100 rounded-lg"
                >
                  <span class="text-sm"
                    >Đây là nội dung bản quyền / metadata, nội dung sẽ được giữ nguyên bản gốc khi
                    xuất file.</span
                  >
                </div>
              } @else if (chapter().translatedText) {
                <div
                  class="prose prose-sm max-w-none text-zinc-900"
                  [innerHTML]="parsedTranslatedHtml()"
                ></div>
              } @else if (chapter().status === 'translating') {
                <app-translating-skeleton />
              } @else {
                <div class="flex items-center justify-center py-12 text-zinc-400">
                  <span class="text-sm">Chưa được dịch.</span>
                </div>
              }
            </div>
          </div>
        </div>
      }

      @if (readerMode(); as mode) {
        <app-chapter-reader-modal
          [mode]="mode"
          [chapter]="chapter()"
          [index]="index()"
          [parsedOriginalHtml]="parsedOriginalHtml()"
          [parsedTranslatedHtml]="parsedTranslatedHtml()"
          (closeModal)="readerMode.set(null)"
          (requestNavigate)="requestNavigate.emit($event)"
        />
      }

      @if (activeModal(); as modalState) {
        <app-chapter-version-modals
          [modalState]="modalState"
          (closeModal)="activeModal.set(null)"
          (confirmGenerateSummary)="generateMissingSummary($event)"
        />
      }
    </div>
  `,
})
export class ChapterItemComponent implements OnDestroy {
  readonly store = inject(BookStore);
  readonly toast = inject(ToastService);
  readonly openRouter = inject(OpenRouterClient);
  private readonly sanitizer = inject(DomSanitizer);

  readonly chapter = input.required<Chapter>();
  readonly index = input.required<number>();
  readonly isExpanded = model(false);

  readonly translateSingle = output<void>();
  readonly requestNavigate = output<number>();

  readonly readerMode = signal<'fullscreen' | 'bilingual' | null>(null);
  readonly activeModal = signal<SnapshotModalState | null>(null);
  readonly isGeneratingSummary = signal(false);

  readonly elapsedSeconds = signal(0);
  private intervalFn: ReturnType<typeof setInterval> | null = null;

  readonly parsedOriginalHtml = computed(() =>
    this.parseMarkdown(this.chapter().originalText, 'c' + this.index() + '-o')
  );
  readonly parsedTranslatedHtml = computed(() =>
    this.parseMarkdown(this.chapter().translatedText, 'c' + this.index() + '-t')
  );

  constructor() {
    effect(() => {
      const status = this.chapter().status;
      if (status === 'translating') {
        if (!this.intervalFn) {
          this.elapsedSeconds.set(0);
          this.intervalFn = setInterval(() => {
            this.elapsedSeconds.update((s) => s + 1);
          }, 1000);
        }
      } else if (this.intervalFn) {
        clearInterval(this.intervalFn);
        this.intervalFn = null;
      }
    });
  }

  ngOnDestroy() {
    if (this.intervalFn) {
      clearInterval(this.intervalFn);
    }
  }

  toggleExpand() {
    this.isExpanded.set(!this.isExpanded());
  }

  openFullscreen() {
    this.readerMode.set('fullscreen');
  }

  openBilingualFullscreen() {
    this.readerMode.set('bilingual');
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  getActiveVersion(chapter: Chapter) {
    if (!chapter.versions || !chapter.activeVersionNumber) return null;
    return chapter.versions.find((v) => v.versionNumber === chapter.activeVersionNumber) || null;
  }

  confirmCreateSummary(version: TranslationVersion) {
    this.activeModal.set({
      type: 'confirmCreateSummary',
      targetVersion: version,
    });
  }

  async generateMissingSummary(version: TranslationVersion) {
    this.activeModal.set(null);
    if (!version || !version.text.trim()) return;

    this.isGeneratingSummary.set(true);
    try {
      const model =
        this.store.config().economyModel ||
        getCustomEconomyModels()[0]?.id ||
        version.model ||
        this.store.config().model;
      const summary = await this.openRouter.summarizeTranslation(
        version.text,
        model,
        this.store.config().translationMode || 'standard'
      );

      if (summary) {
        const currentChapter = this.chapter();
        if (currentChapter.versions) {
          const updatedVersions = currentChapter.versions.map((v) =>
            v.versionNumber === version.versionNumber ? { ...v, summary } : v
          );
          this.store.updateChapter(currentChapter.id, {
            versions: updatedVersions,
          });
          this.toast.success('Đã tạo bản tóm tắt thành công.');
        }
      } else {
        this.toast.error('Không thể tạo bản tóm tắt. Vui lòng thử lại.');
      }
    } catch (e) {
      console.error('Failed to create missing summary', e);
      this.toast.error(
        isPromptLoadError(e) ? parseOpenRouterError(e) : 'Có lỗi xảy ra khi tạo bản tóm tắt.'
      );
    } finally {
      this.isGeneratingSummary.set(false);
    }
  }

  viewCustomGlossary(glossaryMd: string | undefined, ratio?: number, versionNumber?: number) {
    if (!glossaryMd) return;
    this.activeModal.set({
      type: 'glossary',
      parsedHtml: this.parseMarkdown(glossaryMd, 'cgloss'),
      ratio,
      versionNumber,
    });
  }

  viewPronounSnapshot(snapshotText: string | undefined, versionNumber?: number) {
    this.activeModal.set({
      type: 'pronoun',
      parsedHtml: snapshotText ? this.parseMarkdown(snapshotText, 'pronoun') : '',
      versionNumber,
    });
  }

  viewSummary(summary: string) {
    if (!summary) return;
    this.activeModal.set({
      type: 'summary',
      parsedHtml: this.parseMarkdown(summary, this.chapter().id + '-sum'),
    });
  }

  viewContextSummary(summary: string | undefined, contextChapterTitle?: string) {
    if (!summary) return;
    this.activeModal.set({
      type: 'contextSummary',
      parsedHtml: this.parseMarkdown(summary, this.chapter().id + '-csum'),
      contextChapterTitle: contextChapterTitle || 'Chương trước',
    });
  }

  viewCustomInstructionsSnapshot(snapshotText: string | undefined) {
    this.activeModal.set({
      type: 'customInstructions',
      parsedHtml: snapshotText ? this.parseMarkdown(snapshotText, 'cinst') : '',
    });
  }

  parseMarkdown(text: string | undefined, prefix = ''): SafeHtml | string {
    if (!text) return '';
    let processedText = text;
    if (prefix) {
      processedText = processedText.replace(/\[\^([^\]]+)\]/g, `[^${prefix}-$1]`);
    }
    const parsed = getConfiguredMarked().parse(processedText) as string;
    return this.sanitizer.bypassSecurityTrustHtml(parsed);
  }

  onLinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');

    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && (href.startsWith('#fn') || href.startsWith('#footnote'))) {
        event.preventDefault();
        event.stopPropagation();

        const id = href.substring(1);
        const parentProse = anchor.closest('.prose');
        let targetElement = parentProse?.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement;

        if (!targetElement) {
          targetElement = document.getElementById(id) as HTMLElement;
        }

        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetElement.classList.add(
            'bg-yellow-100',
            'dark:bg-yellow-900/30',
            'transition-colors',
            'duration-300',
            'rounded',
            'px-1'
          );
          setTimeout(() => {
            targetElement.classList.remove('bg-yellow-100', 'dark:bg-yellow-900/30');
          }, 2000);
        }
      }
    }
  }
}
