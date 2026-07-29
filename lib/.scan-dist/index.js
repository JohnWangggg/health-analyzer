"use strict";
/**
 * 健康分析库 - 主入口
 * 提供解析、统计、提示词生成的统一接口
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./types"), exports);
__exportStar(require("./parser"), exports);
__exportStar(require("./stats"), exports);
__exportStar(require("./prompts/llm-prompt"), exports);
__exportStar(require("./snapshot"), exports);
__exportStar(require("./locale"), exports);
__exportStar(require("./zh-tw-map"), exports);
__exportStar(require("./signals"), exports);
__exportStar(require("./export"), exports);
__exportStar(require("./insights"), exports);
__exportStar(require("./csv-import"), exports);
//# sourceMappingURL=index.js.map