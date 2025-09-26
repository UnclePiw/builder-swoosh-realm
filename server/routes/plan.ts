import { RequestHandler } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const DATA_DIR = path.join(process.cwd(), "server", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const handlePlan: RequestHandler = async (req, res) => {
  const payload = req.body || {};

  // Try to run Python model if available
  const pythonPath = process.env.PYTHON_PATH ?? "python3";
  const pyScript = path.join(process.cwd(), "server", "model", "run_model.py");

  if (fs.existsSync(pyScript)) {
    try {
      const py = spawn(pythonPath, [pyScript], { stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      py.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      py.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      py.on("close", (code) => {
        const outTrim = stdout ? stdout.toString().trim() : "";
        if (code === 0 && outTrim) {
          try {
            const result = JSON.parse(outTrim);
            // Save a copy locally
            const id = uuidv4();
            const record = { id, createdAt: new Date().toISOString(), input: payload, result };
            fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(record, null, 2));
            res.json({ ok: true, source: "python", id, result });
          } catch (err) {
            console.error("JSON parse error from python stdout:", outTrim, stderr, err);
            res.status(500).json({ ok: false, error: "Invalid JSON from Python model", stdout: outTrim, stderr });
          }
        } else {
          // Fallback: run JS heuristic
          console.warn("Python script failed or produced no output", { code, stderr, stdout });
          const result = runJsFallback(payload);
          const id = uuidv4();
          const record = { id, createdAt: new Date().toISOString(), input: payload, result };
          fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(record, null, 2));
          res.json({ ok: true, source: "fallback", id, result, python_error: stderr });
        }
      });

      // send input JSON to python stdin
      py.stdin.write(JSON.stringify(payload));
      py.stdin.end();

      return;
    } catch (e) {
      // continue to fallback
      console.error("Python spawn error:", e);
    }
  }

  // No python available or error -> fallback
  const result = runJsFallback(payload);
  const id = uuidv4();
  const record = { id, createdAt: new Date().toISOString(), input: payload, result };
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  res.json({ ok: true, source: "fallback", id, result });
};

function runJsFallback(payload: any) {
  // Simple heuristic similar to frontend allocation but using provided inputs and simple forecasting
  const inputs = payload.inputs || {};
  const branch = payload.branch || "สาขา A";
  const date = payload.date ? new Date(payload.date) : new Date();
  const weather = payload.weather || "แดด";
  const special = payload.special_day ? true : false;

  const PRODUCTS: any[] = [
    { key: "croissant", name: "ครัวซองต์", price: 50, recipe: { flour: 50, butter: 30, sugar: 10, eggs: 1 }, base: 120 },
    { key: "butter_cookie", name: "คุกกี้เนย", price: 15, recipe: { flour: 20, butter: 15, sugar: 10, eggs: 0 }, base: 300 },
    { key: "taiwan_cake", name: "เค้กไข่ไต้หวัน", price: 40, recipe: { flour: 30, butter: 5, sugar: 25, eggs: 2 }, base: 80 },
    { key: "brownie", name: "บราวนี่", price: 55, recipe: { flour: 25, butter: 20, sugar: 30, eggs: 1 }, base: 90 },
    { key: "pound_cake", name: "ขนมปังปอนด์", price: 80, recipe: { flour: 100, butter: 10, sugar: 15, eggs: 1 }, base: 60 },
    { key: "macaron", name: "มากา���อน", price: 25, recipe: { flour: 15, butter: 8, sugar: 20, eggs: 2 }, base: 45 },
    { key: "choco_cake", name: "เค้กช็อคโกแลต", price: 65, recipe: { flour: 35, butter: 25, sugar: 35, eggs: 2 }, base: 70 },
    { key: "fruit_tart", name: "ทาร์ต��ลไม้", price: 45, recipe: { flour: 40, butter: 20, sugar: 15, eggs: 1 }, base: 55 },
  ];

  const weatherMul: any = { "แดด": 1.1, "ฝน": 0.7, "ครึ้ม": 0.9, "เมฆเยอะ": 0.95 };
  const dayMul = date.getDay() >= 5 ? 1.2 : 1.0;
  const specialMul = special ? 1.3 : 1.0;
  const branchMul = { "สาขา A": 1.0, "สาขา B": 1.2, "สาขา C": 0.8 }[branch] || 1.0;

  const forecast: any = {};
  for (const p of PRODUCTS) {
    const base = p.base;
    const pred = Math.max(0, Math.round(base * dayMul * (weatherMul[weather] || 1) * specialMul * branchMul * 0.3));
    forecast[p.name] = pred;
  }

  // simple optimization: allocate capacity to maximize profit per resource usage
  const stock = { flour: Number(inputs.flour || 50000), butter: Number(inputs.butter || 15000), sugar: Number(inputs.sugar || 40000), eggs: Number(inputs.eggs || 300) };
  let capacity = Number(inputs.capacity || 2000);

  // compute profit per unit
  const UNIT_COST = { flour: 0.05, butter: 0.2, sugar: 0.04, eggs: 5 };
  const scored = PRODUCTS.map((p) => {
    const cost = p.recipe.flour * UNIT_COST.flour + p.recipe.butter * UNIT_COST.butter + p.recipe.sugar * UNIT_COST.sugar + p.recipe.eggs * UNIT_COST.eggs;
    const profit = p.price - cost;
    const weight = (p.recipe.flour / Math.max(stock.flour, 1)) + (p.recipe.butter / Math.max(stock.butter, 1)) + (p.recipe.sugar / Math.max(stock.sugar, 1)) + (p.recipe.eggs / Math.max(stock.eggs, 1));
    const score = profit / (weight || 1e-6);
    return { p, profit, score };
  }).sort((a, b) => b.score - a.score);

  const plan: any[] = [];
  for (const { p } of scored) {
    if (capacity <= 0) break;
    const maxByFlour = p.recipe.flour ? Math.floor(stock.flour / p.recipe.flour) : Infinity;
    const maxByButter = p.recipe.butter ? Math.floor(stock.butter / p.recipe.butter) : Infinity;
    const maxBySugar = p.recipe.sugar ? Math.floor(stock.sugar / p.recipe.sugar) : Infinity;
    const maxByEggs = p.recipe.eggs ? Math.floor(stock.eggs / p.recipe.eggs) : Infinity;
    let maxUnits = Math.min(maxByFlour, maxByButter, maxBySugar, maxByEggs, capacity);
    if (!isFinite(maxUnits) || maxUnits <= 0) continue;
    const allocate = Math.max(0, Math.floor(Math.min(maxUnits, Math.max(10, capacity * 0.35))));

    stock.flour -= allocate * p.recipe.flour;
    stock.butter -= allocate * p.recipe.butter;
    stock.sugar -= allocate * p.recipe.sugar;
    stock.eggs -= allocate * p.recipe.eggs;
    capacity -= allocate;

    const expected_leftover = Math.max(0, allocate - (forecast[p.name] || 0));
    const cost = p.recipe.flour*UNIT_COST.flour + p.recipe.butter*UNIT_COST.butter + p.recipe.sugar*UNIT_COST.sugar + p.recipe.eggs*UNIT_COST.eggs;
    const gp_margin = +(((p.price - cost) / (p.price||1)).toFixed(2));
    let promo = null;
    if ((forecast[p.name]||0) > 0 && expected_leftover / Math.max(1, forecast[p.name]||0) > 0.3) {
      promo = "โปรโมชั่นแนะนำ: ลดราคา 20%";
    } else if (special) {
      promo = "โปรดจัดชุดขายคู่กับกาแฟ";
    } else if (expected_leftover>0 && expected_leftover>10) {
      promo = "เร่งขาย เพราะวัตถุดิบอาจใกล้หมด";
    }

    plan.push({ product: p.name, key: p.key, quantity: allocate, profitPerUnit: (p.price - cost), expected_leftover, selling_price: p.price, product_cost: +cost.toFixed(2), gp_margin, promotion_suggestion: promo });
  }

  return { forecast, plan, remainingStock: stock };
}
