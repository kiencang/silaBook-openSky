import { Component, Output, EventEmitter, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../core/toast.service';
import { CustomModel, DEFAULT_CUSTOM_MODELS, DEFAULT_ECONOMY_MODELS, getCustomModels, saveCustomModels, getCustomEconomyModels, saveCustomEconomyModels, getQualityTemperature, saveQualityTemperature, ReasoningEffortOption, getReasoningEffort, saveReasoningEffort } from '../../core/openrouter';

@Component({
  selector: 'app-api-key-modal',
  imports: [FormsModule, MatIconModule],
  template: `
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 selection:bg-indigo-100 selection:text-indigo-900 animate-fade-in" tabindex="0" (click)="triggerClose()" (keydown.escape)="triggerClose()" [class.animate-fade-out]="isClosing()">
      <div role="presentation" tabindex="-1" (keyup.enter)="$event.stopPropagation()" class="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-zoom-in cursor-default" (click)="$event.stopPropagation()" [class.animate-zoom-out]="isClosing()">
        <!-- Header -->
        <div class="p-6 border-b border-zinc-100 flex justify-between items-center bg-white">
          <div class="flex items-center space-x-2.5">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <mat-icon>vpn_key</mat-icon>
            </div>
            <div>
              <h3 class="text-lg font-bold text-zinc-900 tracking-tight">Cấu hình OpenRouter API Key & Models</h3>
            </div>
          </div>
          <button (click)="triggerClose()" class="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors rounded-full hover:bg-zinc-200 cursor-pointer border-none bg-transparent focus:outline-none">
            <mat-icon class="!text-[20px] !w-5 !h-5 !flex !items-center !justify-center">close</mat-icon>
          </button>
        </div>
        
        <!-- Content -->
        <div class="p-6 space-y-5 overflow-y-auto bg-white">
          <p class="text-sm text-zinc-600 leading-relaxed">
            Ứng dụng kết nối trực tiếp với OpenRouter API, cổng trung gian này sẽ kết nối với bất cứ model AI nào mà nó có (hiện có gần 400 model). Vì dịch là nhiệm vụ khó, bạn hãy chọn các model AI chất lượng nhất trong khả năng. Ứng dụng lưu trữ sẵn một số model mặc định chất lượng cao, bạn có thể tự do điều chỉnh lại thành các model khác theo ý muốn.
          </p>
          <p class="text-sm text-zinc-600 leading-relaxed mt-3">
            Một số model thuộc nhóm hàng đầu có chi phí lớn, có thể dao động từ 10 - 30$/1M token đầu ra, để kiểm soát chi phí tốt hơn, bạn nên nắm rõ giá của chúng. Hãy vào trang: <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">https://openrouter.ai/models</a>, rồi nhập mã model vào ô "Search models" để biết thông tin giá cụ thể tại thời điểm tra cứu.
          </p>

          <!-- Status badge/links -->
          <div class="flex items-center space-x-2.5 text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 p-2.5 rounded-xl">
            @if (hasSavedKey()) {
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                Đang dùng OpenRouter Key của bạn
              </span>
            } @else {
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-750 border border-indigo-100">
                Bạn chưa nhập OpenRouter API Key
              </span>
            }
            <span class="text-zinc-350">|</span>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-750 font-bold hover:underline flex items-center cursor-pointer no-underline">
              <mat-icon class="!text-[14px] !w-3.5 !h-3.5 mr-1 text-indigo-500">help_outline</mat-icon>Nơi lấy API Key OpenRouter
            </a>
          </div>

          <div class="space-y-1.5">
            <label for="openrouterApiKey" class="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
              OPENROUTER API KEY CÁ NHÂN
            </label>
            <div class="relative flex items-center">
              <input id="openrouterApiKey" 
                     [type]="showKey() ? 'text' : 'password'" 
                     [(ngModel)]="apiKey" 
                     placeholder="sk-or-v1-..." 
                     (keydown.enter)="saveKey()"
                     class="w-full pl-4 pr-11 py-2.5 border border-zinc-305 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm tracking-wide font-mono transition-shadow outline-none text-zinc-800 bg-zinc-50 focus:bg-white">
              <button (click)="toggleShowKey()" 
                      type="button"
                      class="absolute right-3 text-zinc-450 hover:text-zinc-650 transition-colors p-1 rounded-md focus:outline-none flex items-center justify-center border-none bg-transparent cursor-pointer">
                <mat-icon class="text-[20px]">{{ showKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </div>
            <p class="text-[11px] text-zinc-450 leading-relaxed">
              Khóa API được lưu <em class="not-italic font-semibold text-zinc-600">cục bộ an toàn</em> trong trình duyệt của bạn (<code class="bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">LocalStorage</code>). Chỉ nên dùng trên máy tính cá nhân của bạn, nếu bất khả kháng phải dùng trên máy tính của người khác thì sau khi dịch xong, cần "Xóa Key cá nhân" này khỏi ứng dụng (nút ngoài cùng ở dưới, bên trái).
            </p>
          </div>

          <!-- Divider -->
          <div class="h-px bg-zinc-200 my-2"></div>

          <!-- Quality Custom Models List Config -->
          <div class="space-y-3">
            <div>
              <div class="block text-xs font-bold text-zinc-800 uppercase tracking-wider">
                DANH SÁCH MÔ HÌNH AI CHẤT LƯỢNG CAO (TỐI ĐA 9 MODEL)
              </div>
              <p class="text-[11px] text-zinc-500 mt-0.5">
                Nhập mã model từ OpenRouter (VD: <code class="bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">~google/gemini-flash-latest</code>) dùng cho dịch thuật chính thức, phân tích đại từ & từ khó. Mã model ở cột trái cần nhập tuyệt đối chính xác, nhãn tên ở cột phải tùy ý bạn đặt miễn sao dễ hiểu cho chính bạn. Bạn có thể thêm, sửa, xóa, điều chỉnh thứ tự danh sách các model AI bên dưới. Danh sách các model AI có thể tham khảo ở đây: <a href="https://openrouter.ai/discover" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">https://openrouter.ai/discover</a>
              </p>
            </div>

            <!-- Quality Temperature Setting -->
            <div class="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100 space-y-2.5">
              <label for="qualityTempRange" class="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <mat-icon class="!text-[16px] !w-4 !h-4 text-indigo-600">tune</mat-icon>
                <span>Chỉ số ngẫu nhiên / Sáng tạo (Temperature)</span>
              </label>

              <!-- Centered Temperature Value Badge -->
              <div class="flex items-center justify-center pt-0.5 pb-0.5">
                <span class="px-3 py-0.5 bg-indigo-600 text-white font-mono text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5">
                  <span class="text-indigo-200 text-[11px] font-normal">Giá trị:</span>
                  <span>{{ qualityTemperature().toFixed(1) }}</span>
                </span>
              </div>

              <!-- Slider & Edge Labels -->
              <div class="flex items-center justify-between gap-2 px-0.5">
                <span class="text-[11px] font-medium text-zinc-500 whitespace-nowrap shrink-0">0.0 (Chính xác)</span>
                <input 
                  id="qualityTempRange"
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  [ngModel]="qualityTemperature()" 
                  (ngModelChange)="onTemperatureChange($event)"
                  class="grow max-w-[180px] sm:max-w-[220px] accent-indigo-600 cursor-pointer h-1.5 bg-indigo-200/80 rounded-lg appearance-none"
                />
                <span class="text-[11px] font-medium text-zinc-500 whitespace-nowrap shrink-0">1.0 (Sáng tạo)</span>
              </div>

              <p class="text-[11px] text-zinc-500 leading-relaxed pt-0.5">
                Áp dụng cho tất cả nhiệm vụ dùng Mô hình AI Chất lượng cao (Dịch thuật, Phân tích Đại từ, Từ khó). Mặc định là <strong class="text-zinc-700">1</strong>, giúp các model AI có khả năng suy luận (reasoning) tốt hơn.
              </p>
            </div>

            <!-- Reasoning Effort Setting -->
            <div class="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100 space-y-2.5">
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <mat-icon class="!text-[16px] !w-4 !h-4 text-indigo-600">psychology</mat-icon>
                  <span>Mức độ tư duy suy luận (Reasoning Effort)</span>
                </label>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-indigo-100/60 p-1 rounded-xl">
                <button 
                  type="button" 
                  (click)="reasoningEffort.set('high')"
                  [class.bg-indigo-600]="reasoningEffort() === 'high'"
                  [class.text-white]="reasoningEffort() === 'high'"
                  [class.shadow-xs]="reasoningEffort() === 'high'"
                  [class.text-zinc-700]="reasoningEffort() !== 'high'"
                  [class.hover:bg-indigo-200/50]="reasoningEffort() !== 'high'"
                  class="py-1.5 px-2 text-xs font-medium rounded-lg transition-all cursor-pointer border-none flex flex-col items-center justify-center gap-0.5"
                >
                  <span class="font-bold">High (Cao)</span>
                  <span class="text-[10px] opacity-80 font-normal">Mặc định</span>
                </button>

                <button 
                  type="button" 
                  (click)="reasoningEffort.set('medium')"
                  [class.bg-indigo-600]="reasoningEffort() === 'medium'"
                  [class.text-white]="reasoningEffort() === 'medium'"
                  [class.shadow-xs]="reasoningEffort() === 'medium'"
                  [class.text-zinc-700]="reasoningEffort() !== 'medium'"
                  [class.hover:bg-indigo-200/50]="reasoningEffort() !== 'medium'"
                  class="py-1.5 px-2 text-xs font-medium rounded-lg transition-all cursor-pointer border-none flex flex-col items-center justify-center gap-0.5"
                >
                  <span class="font-bold">Medium</span>
                  <span class="text-[10px] opacity-80 font-normal">Vừa phải</span>
                </button>

                <button 
                  type="button" 
                  (click)="reasoningEffort.set('low')"
                  [class.bg-indigo-600]="reasoningEffort() === 'low'"
                  [class.text-white]="reasoningEffort() === 'low'"
                  [class.shadow-xs]="reasoningEffort() === 'low'"
                  [class.text-zinc-700]="reasoningEffort() !== 'low'"
                  [class.hover:bg-indigo-200/50]="reasoningEffort() !== 'low'"
                  class="py-1.5 px-2 text-xs font-medium rounded-lg transition-all cursor-pointer border-none flex flex-col items-center justify-center gap-0.5"
                >
                  <span class="font-bold">Low (Thấp)</span>
                  <span class="text-[10px] opacity-80 font-normal">Tiết kiệm</span>
                </button>

                <button 
                  type="button" 
                  (click)="reasoningEffort.set('none')"
                  [class.bg-indigo-600]="reasoningEffort() === 'none'"
                  [class.text-white]="reasoningEffort() === 'none'"
                  [class.shadow-xs]="reasoningEffort() === 'none'"
                  [class.text-zinc-700]="reasoningEffort() !== 'none'"
                  [class.hover:bg-indigo-200/50]="reasoningEffort() !== 'none'"
                  class="py-1.5 px-2 text-xs font-medium rounded-lg transition-all cursor-pointer border-none flex flex-col items-center justify-center gap-0.5"
                >
                  <span class="font-bold">Tắt</span>
                  <span class="text-[10px] opacity-80 font-normal">Nhanh nhất</span>
                </button>
              </div>

              <p class="text-[11px] text-zinc-500 leading-relaxed pt-0.5">
                Áp dụng cho các model AI hỗ trợ tính năng tư duy (Reasoning tokens). Mặc định là <strong class="text-zinc-700">High</strong> để cho chất lượng phân tích & dịch thuật sâu nhất. Chọn <strong class="text-zinc-700">Medium / Low</strong> để giảm token tiêu tốn, hoặc <strong class="text-zinc-700">Tắt</strong> nếu ưu tiên phản hồi nhanh.
              </p>
            </div>

            <div class="space-y-2">
              @for (model of models(); track $index) {
                <div class="flex items-center space-x-2 bg-zinc-50 p-2 rounded-xl border border-zinc-200">
                  <span class="text-xs font-bold text-zinc-400 w-4 text-center">{{ $index + 1 }}</span>
                  <div class="flex items-center space-x-1">
                    <button 
                      type="button" 
                      (click)="moveModelUp($index)" 
                      [disabled]="$first"
                      class="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-indigo-600 hover:bg-zinc-200/60 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển lên"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_up</mat-icon>
                    </button>
                    <button 
                      type="button" 
                      (click)="moveModelDown($index)" 
                      [disabled]="$last"
                      class="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-indigo-600 hover:bg-zinc-200/60 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển xuống"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_down</mat-icon>
                    </button>
                  </div>
                  <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      [(ngModel)]="model.id" 
                      placeholder="Mã model (vd: ~google/gemini-flash-latest)" 
                      class="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-mono text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input 
                      type="text" 
                      [(ngModel)]="model.name" 
                      placeholder="Tên hiển thị (vd: Google Gemini Flash Latest)" 
                      class="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <button 
                    type="button" 
                    (click)="removeModel($index)" 
                    class="w-7 h-7 text-zinc-400 hover:text-red-600 flex items-center justify-center rounded-md hover:bg-red-50 border-none bg-transparent cursor-pointer"
                    title="Xóa model này"
                  >
                    <mat-icon class="!text-[18px] !w-4.5 !h-4.5">delete</mat-icon>
                  </button>
                </div>
              }
            </div>

            @if (models().length < 9) {
              <button 
                type="button" 
                (click)="addModel()" 
                class="w-full py-2 border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50/50 hover:border-indigo-400 font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer bg-transparent"
              >
                <mat-icon class="!text-[16px] !w-4 !h-4">add</mat-icon>
                Thêm model AI dịch khác
              </button>
            }
          </div>

          <!-- Divider -->
          <div class="h-px bg-zinc-200 my-2"></div>

          <!-- Economy Custom Models List Config -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="block text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <mat-icon class="!text-[16px] !w-4 !h-4 text-amber-600">savings</mat-icon>
                  <span>DANH SÁCH MÔ HÌNH AI TIẾT KIỆM (TỐI ĐA 3 MODEL)</span>
                </div>
                <p class="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                  Dùng riêng cho việc chuyển đổi PDF sang Markdown và quét chia khối trước khi dịch. Các mô hình này sử dụng Temperature cố định = 0.3 để tối ưu tính chính xác. Đối với việc chuyển đổi PDF thành markdown bắt buộc phải dùng modal đa phương thức (để có khả năng xử lý PDF scan). Để tiết kiệm nhất nên dùng các công cụ miễn phí bên ngoài để chuyển PDF thành markdown, ví dụ như <a href="https://aistudio.baidu.com/paddleocr" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">PaddleOCR</a> hoặc <a href="https://ocr.z.ai" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">GLM-OCR</a>.
                </p>
              </div>
            </div>

            <div class="space-y-2">
              @for (model of economyModels(); track $index) {
                <div class="flex items-center space-x-2 bg-amber-50/50 p-2 rounded-xl border border-amber-200/80">
                  <span class="text-xs font-bold text-amber-500 w-4 text-center">{{ $index + 1 }}</span>
                  <div class="flex items-center space-x-1">
                    <button 
                      type="button" 
                      (click)="moveEconomyModelUp($index)" 
                      [disabled]="$first"
                      class="w-7 h-7 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển lên"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_up</mat-icon>
                    </button>
                    <button 
                      type="button" 
                      (click)="moveEconomyModelDown($index)" 
                      [disabled]="$last"
                      class="w-7 h-7 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent border-none bg-transparent cursor-pointer transition-colors"
                      title="Di chuyển xuống"
                    >
                      <mat-icon class="!text-[22px] !w-5.5 !h-5.5">keyboard_arrow_down</mat-icon>
                    </button>
                  </div>
                  <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      [(ngModel)]="model.id" 
                      placeholder="Mã model (vd: google/gemini-3.5-flash-lite)" 
                      class="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs font-mono text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <input 
                      type="text" 
                      [(ngModel)]="model.name" 
                      placeholder="Tên hiển thị (vd: Google Gemini 3.5 Flash Lite)" 
                      class="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs text-zinc-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <button 
                    type="button" 
                    (click)="removeEconomyModel($index)" 
                    class="w-7 h-7 text-zinc-400 hover:text-red-600 flex items-center justify-center rounded-md hover:bg-red-50 border-none bg-transparent cursor-pointer"
                    title="Xóa model này"
                  >
                    <mat-icon class="!text-[18px] !w-4.5 !h-4.5">delete</mat-icon>
                  </button>
                </div>
              }
            </div>

            @if (economyModels().length < 3) {
              <button 
                type="button" 
                (click)="addEconomyModel()" 
                class="w-full py-2 border border-dashed border-amber-300 text-amber-700 hover:bg-amber-50/50 hover:border-amber-400 font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer bg-transparent"
              >
                <mat-icon class="!text-[16px] !w-4 !h-4">add</mat-icon>
                Thêm mô hình tiết kiệm
              </button>
            }
          </div>
        </div>

        <!-- Actions -->
        <div class="p-4 bg-zinc-50 border-t border-zinc-100 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <div class="flex items-center gap-2">
            @if (hasSavedKey()) {
              <button (click)="deleteKey()" 
                      class="px-3.5 py-1.5 bg-white border border-red-200 text-red-600 font-medium hover:bg-red-50 hover:border-red-300 rounded-lg transition-all shadow-sm focus:ring-2 focus:ring-red-100 focus:outline-none text-xs cursor-pointer">
                Xóa Key cá nhân
              </button>
            }
            <button type="button" (click)="resetDefaultModels()" 
                    class="px-3.5 py-1.5 bg-white border border-zinc-300 text-zinc-700 font-medium hover:bg-zinc-100 hover:text-indigo-600 hover:border-indigo-300 rounded-lg transition-all shadow-sm focus:ring-2 focus:ring-zinc-200 focus:outline-none text-xs cursor-pointer flex items-center gap-1.5">
              <mat-icon class="!text-[16px] !w-4 !h-4 text-zinc-500">restart_alt</mat-icon>
              <span>Khôi phục mặc định</span>
            </button>
          </div>
          <div class="flex space-x-2">
            <button (click)="triggerClose()" 
                    class="px-4 py-1.5 bg-white border border-zinc-300 text-zinc-700 font-medium hover:bg-zinc-100 rounded-lg transition-colors shadow-sm focus:ring-2 focus:ring-zinc-200 focus:outline-none text-xs cursor-pointer">
              Hủy
            </button>
            <button (click)="saveKey()" 
                    [disabled]="!apiKey.trim()"
                    [class.opacity-50]="!apiKey.trim()"
                    [class.cursor-not-allowed]="!apiKey.trim()"
                    class="px-4 py-1.5 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-xs cursor-pointer border-none">
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ApiKeyModal {
  @Output() closeModal = new EventEmitter<void>();
  private toast = inject(ToastService);
  
  isClosing = signal(false);
  showKey = signal(false);
  apiKey = '';
  hasSavedKey = signal(false);
  models = signal<CustomModel[]>([]);
  economyModels = signal<CustomModel[]>([]);
  qualityTemperature = signal<number>(1.0);
  reasoningEffort = signal<ReasoningEffortOption>('high');

  constructor() {
    this.checkSavedKey();
    this.models.set(getCustomModels().map(m => ({ ...m })));
    this.economyModels.set(getCustomEconomyModels().map(m => ({ ...m })));
    this.qualityTemperature.set(getQualityTemperature());
    this.reasoningEffort.set(getReasoningEffort());
  }

  onTemperatureChange(val: number | string) {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (!isNaN(num)) {
      this.qualityTemperature.set(Math.min(1, Math.max(0, Math.round(num * 10) / 10)));
    }
  }

  addModel() {
    if (this.models().length < 9) {
      this.models.update(list => [...list, { id: '', name: '' }]);
    }
  }

  removeModel(index: number) {
    this.models.update(list => list.filter((_, i) => i !== index));
  }

  moveModelUp(index: number) {
    if (index <= 0) return;
    this.models.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index - 1];
      newList[index - 1] = temp;
      return newList;
    });
  }

  moveModelDown(index: number) {
    if (index >= this.models().length - 1) return;
    this.models.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index + 1];
      newList[index + 1] = temp;
      return newList;
    });
  }

  addEconomyModel() {
    if (this.economyModels().length < 3) {
      this.economyModels.update(list => [...list, { id: '', name: '' }]);
    }
  }

  removeEconomyModel(index: number) {
    this.economyModels.update(list => list.filter((_, i) => i !== index));
  }

  moveEconomyModelUp(index: number) {
    if (index <= 0) return;
    this.economyModels.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index - 1];
      newList[index - 1] = temp;
      return newList;
    });
  }

  moveEconomyModelDown(index: number) {
    if (index >= this.economyModels().length - 1) return;
    this.economyModels.update(list => {
      const newList = [...list];
      const temp = newList[index];
      newList[index] = newList[index + 1];
      newList[index + 1] = temp;
      return newList;
    });
  }

  resetDefaultModels() {
    const defaultModels = DEFAULT_CUSTOM_MODELS.map(m => ({ ...m }));
    const defaultEconomy = DEFAULT_ECONOMY_MODELS.map(m => ({ ...m }));
    const defaultTemp = 1.0;
    const defaultReasoning: ReasoningEffortOption = 'high';

    this.models.set(defaultModels);
    this.economyModels.set(defaultEconomy);
    this.qualityTemperature.set(defaultTemp);
    this.reasoningEffort.set(defaultReasoning);

    if (typeof window !== 'undefined') {
      saveCustomModels(defaultModels);
      saveCustomEconomyModels(defaultEconomy);
      saveQualityTemperature(defaultTemp);
      saveReasoningEffort(defaultReasoning);
      window.dispatchEvent(new Event('api-key-changed'));
    }

    this.toast.success('Đã khôi phục và tự động lưu cấu hình mặc định thành công!');
  }

  checkSavedKey() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user_openrouter_api_key') || localStorage.getItem('user_gemini_api_key');
      this.hasSavedKey.set(!!(saved && saved.trim() !== ''));
      if (saved) {
        this.apiKey = saved;
      } else {
        this.apiKey = '';
      }
    }
  }

  toggleShowKey() {
    this.showKey.update(v => !v);
  }

  triggerClose() {
    this.isClosing.set(true);
    setTimeout(() => {
      this.closeModal.emit();
    }, 200);
  }

  saveKey() {
    const trimmed = this.apiKey.trim();
    if (!trimmed) return;
    
    if (!/^[a-zA-Z0-9_\-.:/]+$/.test(trimmed)) {
      this.toast.error('API Key không hợp lệ. Hãy đảm bảo bạn không dán nhầm chữ tiếng Việt có dấu, khoảng trắng hay ký tự đặc biệt.');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('user_openrouter_api_key', trimmed);
      localStorage.setItem('user_gemini_api_key', trimmed);
      saveCustomModels(this.models());
      saveCustomEconomyModels(this.economyModels());
      saveQualityTemperature(this.qualityTemperature());
      saveReasoningEffort(this.reasoningEffort());
      window.dispatchEvent(new Event('api-key-changed'));
      this.toast.success('Đã lưu cấu hình OpenRouter API Key, Models, Temperature & Reasoning thành công!');
    }
    this.triggerClose();
  }

  deleteKey() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_openrouter_api_key');
      localStorage.removeItem('user_gemini_api_key');
      window.dispatchEvent(new Event('api-key-changed'));
      this.toast.success('Xóa OpenRouter API Key cá nhân thành công.');
    }
    this.triggerClose();
  }
}
