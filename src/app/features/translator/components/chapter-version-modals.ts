import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { TranslationVersion } from '../../../core/book.store';

export type SnapshotModalType =
  | 'glossary'
  | 'pronoun'
  | 'summary'
  | 'contextSummary'
  | 'customInstructions'
  | 'confirmCreateSummary';

export interface SnapshotModalState {
  type: SnapshotModalType;
  parsedHtml?: SafeHtml | string;
  versionNumber?: number;
  ratio?: number;
  contextChapterTitle?: string;
  targetVersion?: TranslationVersion;
}

const TABLE_PROSE_CLASS =
  'prose prose-sm max-w-none text-zinc-700 w-full [&>table]:w-full [&>table]:min-w-full [&_th]:bg-zinc-50 [&_th]:font-semibold [&_th]:text-left [&_th]:p-3 [&_th]:border-y [&_th]:border-zinc-200 [&_td]:p-3 [&_td]:border-b [&_td]:border-zinc-100';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chapter-version-modals',
  imports: [MatIconModule],
  template: `
    @let state = modalState();
    @if (state.type === 'confirmCreateSummary') {
      <div
        class="fixed inset-0 bg-zinc-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300"
      >
        <div
          class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 border border-zinc-100"
        >
          <div class="p-8 text-center">
            <div
              class="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <mat-icon class="!w-8 !h-8 !text-[32px]">auto_awesome</mat-icon>
            </div>
            <h3 class="text-xl font-bold text-zinc-900 mb-3">Tạo bản tóm tắt</h3>
            <p class="text-zinc-600 leading-relaxed mb-8">
              Khối dịch này hiện chưa có bản tóm tắt bối cảnh. Bạn có muốn tạo bản tóm tắt ngay bây
              giờ không?
            </p>

            <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                (click)="closeModal.emit()"
                class="w-full sm:w-1/2 px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 font-semibold hover:bg-zinc-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                (click)="state.targetVersion && confirmGenerateSummary.emit(state.targetVersion)"
                class="w-full sm:w-1/2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/30 transition-all active:scale-95"
              >
                Tạo ngay
              </button>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div
        class="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 cursor-pointer animate-in fade-in duration-200"
        tabindex="0"
        (click)="triggerClose()"
        (keydown.escape)="triggerClose()"
        [class.animate-fade-out]="isClosing()"
      >
        <div
          role="presentation"
          tabindex="-1"
          (keyup.enter)="$event.stopPropagation()"
          class="bg-white rounded-2xl shadow-xl w-full max-h-[80vh] flex flex-col overflow-hidden cursor-default animate-in zoom-in duration-200"
          [class.max-w-3xl]="state.type === 'glossary'"
          [class.max-w-5xl]="state.type === 'pronoun'"
          [class.max-w-2xl]="
            state.type === 'summary' ||
            state.type === 'contextSummary' ||
            state.type === 'customInstructions'
          "
          (click)="$event.stopPropagation()"
          [class.animate-zoom-out]="isClosing()"
        >
          <div
            class="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50/80"
          >
            <div class="flex flex-col">
              @switch (state.type) {
                @case ('glossary') {
                  <h2 class="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <mat-icon class="text-indigo-500">menu_book</mat-icon>
                    Thuật ngữ đã dùng cho khối này (v{{ state.versionNumber ?? '?' }})
                  </h2>
                  <p class="text-[13px] text-zinc-500 mt-1 ml-8">
                    Mỗi khối dịch sẽ trích những thuật ngữ phù hợp từ danh sách tổng thể thuật ngữ
                    của cả cuốn sách, điều này giúp tránh dư thừa các thuật ngữ không dùng đến.
                  </p>
                  @if (state.ratio !== undefined) {
                    <p class="text-[13px] font-medium text-indigo-600 mt-1 ml-8">
                      Khối này dùng {{ state.ratio }}% số thuật ngữ của toàn cuốn sách.
                    </p>
                  }
                }
                @case ('pronoun') {
                  <h2 class="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <mat-icon class="text-emerald-500">assignment_ind</mat-icon>
                    Bảng đại từ nhân xưng đã dùng cho khối này (v{{ state.versionNumber ?? '?' }})
                  </h2>
                  <p class="text-[13px] text-zinc-500 mt-1 ml-8">
                    Toàn bộ bảng đại từ này được đưa vào khi dịch khối này. Điều đó giúp công cụ
                    dịch có đầy đủ bối cảnh hơn.
                  </p>
                }
                @case ('summary') {
                  <h2 class="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <mat-icon class="text-amber-500">auto_awesome</mat-icon>
                    Bản tóm tắt khối dịch
                  </h2>
                  <p class="text-[13px] text-zinc-500 mt-1 ml-8">
                    Bản tóm tắt ngắn gọn của bản dịch được dùng làm bối cảnh để đưa vào khối dịch
                    tiếp theo, giúp cải thiện chất lượng dịch.
                  </p>
                }
                @case ('contextSummary') {
                  <h2 class="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <mat-icon class="text-cyan-500">psychology</mat-icon>
                    Tóm tắt ngữ cảnh đã dùng
                  </h2>
                  <p class="text-[13px] text-zinc-500 mt-1 ml-8">
                    Được trích xuất từ:
                    <span class="font-medium text-cyan-600">{{
                      state.contextChapterTitle || 'Chương trước'
                    }}</span>
                  </p>
                }
                @case ('customInstructions') {
                  <h2 class="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <mat-icon class="text-fuchsia-500">tune</mat-icon>
                    Chỉ thị bổ sung đã dùng cho khối dịch này
                  </h2>
                  <p class="text-[13px] text-zinc-500 mt-1 ml-8">
                    Đây là những chỉ dẫn thêm được nạp cùng khối văn bản để điều hướng quá trình
                    dịch thuật của AI.
                  </p>
                }
              }
            </div>
            <button
              (click)="triggerClose()"
              class="text-zinc-400 hover:text-zinc-700 w-8 h-8 rounded-full hover:bg-zinc-200 transition-colors flex items-center justify-center self-start flex-shrink-0 ml-4"
            >
              <span
                class="material-icons !text-[20px] !w-5 !h-5 !flex !items-center !justify-center leading-none"
                >close</span
              >
            </button>
          </div>

          <div class="p-6 overflow-y-auto flex-1 bg-white">
            @if (state.parsedHtml) {
              <div
                [class]="
                  state.type === 'glossary' || state.type === 'pronoun'
                    ? tableProseClass
                    : 'prose prose-sm max-w-none text-zinc-700'
                "
                [innerHTML]="state.parsedHtml"
              ></div>
            } @else {
              <div class="text-zinc-500 italic text-sm text-center py-8 bg-zinc-50 rounded-lg">
                Không có dữ liệu chi tiết.
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ChapterVersionModalsComponent {
  readonly modalState = input.required<SnapshotModalState>();
  readonly closeModal = output<void>();
  readonly confirmGenerateSummary = output<TranslationVersion>();

  readonly isClosing = signal(false);
  readonly tableProseClass = TABLE_PROSE_CLASS;

  triggerClose() {
    this.isClosing.set(true);
    setTimeout(() => {
      this.isClosing.set(false);
      this.closeModal.emit();
    }, 200);
  }
}
