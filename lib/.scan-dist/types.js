"use strict";
/**
 * 数据类型定义
 * Apple Health 导出数据的所有结构定义
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_WEIGHT_PRESETS = exports.DEFAULT_RECOVERY_WEIGHTS = void 0;
/** 默认等权（与历史启发式一致） */
exports.DEFAULT_RECOVERY_WEIGHTS = {
    hrv: 1,
    sleep: 1,
    nightHr: 1,
    spo2Night: 1,
    exercise: 1,
    workout: 1,
    steps: 1,
};
/**
 * 恢复 / 负荷权重预设（相对比例，经 normalizeRecoveryWeights 使用）。
 * balanced 与 DEFAULT_RECOVERY_WEIGHTS 一致。
 */
exports.RECOVERY_WEIGHT_PRESETS = {
    balanced: {
        hrv: 1,
        sleep: 1,
        nightHr: 1,
        spo2Night: 1,
        exercise: 1,
        workout: 1,
        steps: 1,
    },
    /** 恢复优先：抬高 HRV/睡眠/夜心率/夜血氧，略降负荷侧 */
    recoveryFirst: {
        hrv: 1.4,
        sleep: 1.4,
        nightHr: 1.2,
        spo2Night: 1.1,
        exercise: 0.8,
        workout: 0.7,
        steps: 0.8,
    },
    /** 训练期：抬高锻炼/Workout/步数，略降部分恢复侧 */
    training: {
        hrv: 0.9,
        sleep: 1.0,
        nightHr: 0.9,
        spo2Night: 0.8,
        exercise: 1.3,
        workout: 1.4,
        steps: 1.2,
    },
    /** 减脂：抬高步数/锻炼与睡眠 */
    weightLoss: {
        hrv: 1.0,
        sleep: 1.2,
        nightHr: 1.0,
        spo2Night: 1.0,
        exercise: 1.2,
        workout: 1.0,
        steps: 1.3,
    },
};
//# sourceMappingURL=types.js.map