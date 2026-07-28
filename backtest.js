import { analyzeCandles } from './indicators.js';

function num(value) { return Number(value) || 0; }

export function runBacktest(candles = [], options = {}) {
  const selected = options.indicators?.length ? options.indicators : ['ema20', 'ema50', 'rsi', 'macd'];
  const fee = Math.max(0, num(options.feePercent) / 100);
  const slippagePercent = Math.max(0, num(options.slippagePercent ?? 0.05));
  const spreadPercent = Math.max(0, num(options.spreadPercent ?? 0.04));
  const fundingPercent = Math.max(0, num(options.fundingPercent ?? 0));
  const totalCostPerRound = (slippagePercent + spreadPercent) / 100 * 2 + fee * 2;
  const stopAtr = Math.max(.2, num(options.stopAtr) || 1.5);
  const reward = Math.max(.5, num(options.rewardRisk) || 2);
  const initial = Math.max(1, num(options.initialBalance) || 1000);
  const trades = []; const equityCurve = [{ index: 0, balance: initial }];
  let balance = initial; let peak = initial; let maxDrawdown = 0; let position = null; let wins = 0; let losses = 0; let grossProfit = 0; let grossLoss = 0;
  let longTrades = 0; let shortTrades = 0; let winStreak = 0; let lossStreak = 0; let maxWinStreak = 0; let maxLossStreak = 0; let totalCosts = 0;
  for (let index = 80; index < candles.length; index += 1) {
    const slice = candles.slice(0, index + 1); const analysis = analyzeCandles(slice, selected, options.timeframe || '1h'); const close = num(candles[index][4]); const high = num(candles[index][2]); const low = num(candles[index][3]); const atr = Math.max(num(analysis.atr), close * .003);
    if (!position && ['buy', 'sell'].includes(analysis.signal)) {
      const direction = analysis.signal === 'buy' ? 1 : -1; const riskDistance = atr * stopAtr;
      position = { entry: close, direction, stop: close - direction * riskDistance, target: close + direction * riskDistance * reward, openedAt: index, signal: analysis.signal };
      if (direction === 1) longTrades += 1; else shortTrades += 1;
      continue;
    }
    if (!position) continue;
    const hitStop = position.direction === 1 ? low <= position.stop : high >= position.stop;
    const hitTarget = position.direction === 1 ? high >= position.target : low <= position.target;
    const reversed = analysis.signal !== 'wait' && analysis.signal !== (position.direction === 1 ? 'buy' : 'sell');
    if (hitStop || hitTarget || reversed || index === candles.length - 1) {
      const exit = hitStop ? position.stop : hitTarget ? position.target : close;
      const holdingBars = Math.max(1, index - position.openedAt); const funding = fundingPercent / 100 * Math.ceil(holdingBars / 8);
      const gross = ((exit - position.entry) / position.entry) * position.direction; const net = gross - totalCostPerRound - funding;
      const riskFraction = Math.max(Math.abs(position.entry - position.stop) / position.entry, .0001); const pnl = balance * .01 * (net / riskFraction);
      const costs = Math.abs(balance * .01 * (totalCostPerRound + funding) / riskFraction); totalCosts += costs;
      balance += pnl; peak = Math.max(peak, balance); maxDrawdown = Math.min(maxDrawdown, (balance - peak) / peak * 100);
      const win = pnl >= 0; if (win) { wins += 1; grossProfit += pnl; winStreak += 1; lossStreak = 0; maxWinStreak = Math.max(maxWinStreak, winStreak); } else { losses += 1; grossLoss += Math.abs(pnl); lossStreak += 1; winStreak = 0; maxLossStreak = Math.max(maxLossStreak, lossStreak); }
      trades.push({ ...position, exit, pnl, costs, fundingPercent, holdingBars, returnPercent: net * 100, win, closedAt: index });
      equityCurve.push({ index, balance: Number(balance.toFixed(2)) }); position = null;
    }
  }
  const total = trades.length;
  return { initial, balance, netProfit: balance - initial, total, wins, losses, winRate: total ? wins / total * 100 : 0, maxDrawdown, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0, averageTrade: total ? trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / total : 0, averageHoldingBars: total ? trades.reduce((sum, trade) => sum + trade.holdingBars, 0) / total : 0, longTrades, shortTrades, maxWinStreak, maxLossStreak, totalCosts, slippagePercent, spreadPercent, fundingPercent, equityCurve: equityCurve.slice(-120), trades: trades.slice(-50) };
}
