import { useEffect, useMemo, useState } from "react";
import { useAppContext } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pie, PieChart, Cell } from "recharts";
import { CheckCircle2, Pencil, RotateCcw, Calculator, Wheat, Egg, Candy, PackageOpen, ChefHat, CircleDollarSign } from "lucide-react";
import { toast as sonner } from "sonner";

// Thai labels
const TH = {
  flour: "แป้ง (g)",
  eggs: "ไข่ (ฟอง)",
  butter: "เนย (g)",
  sugar: "น้ำ���าล (g)",
  capacity: "กำลังการผลิตต่อวัน (ชิ้น)",
  profitTarget: "เป้าหมายกำไร (ไม่บังคับ)",
  calculate: "คำนวณแผนการผลิต",
  confirm: "ยืนยันแผนการผลิต",
  manual: "ปรับเอง (Manual Adjust)",
  recalc: "Recalculate",
};

// Unit costs (THB)
const UNIT_COST = {
  flour: 0.05,
  butter: 0.2,
  sugar: 0.04,
  eggs: 5,
};

// Product recipes and prices
const PRODUCTS: {
  key: string;
  name: string;
  price: number;
  recipe: { flour: number; butter: number; sugar: number; eggs: number };
}[] = [
  { key: "croissant", name: "ครัวซองต์", price: 50, recipe: { flour: 50, butter: 30, sugar: 10, eggs: 1 } },
  { key: "butter_cookie", name: "คุกกี้เนย", price: 15, recipe: { flour: 20, butter: 15, sugar: 10, eggs: 0 } },
  { key: "taiwan_cake", name: "เค้กไข่ไต้หวัน", price: 40, recipe: { flour: 30, butter: 5, sugar: 25, eggs: 2 } },
  { key: "brownie", name: "บราวนี่", price: 55, recipe: { flour: 25, butter: 20, sugar: 30, eggs: 1 } },
  { key: "pound_cake", name: "ขนมปังปอนด์", price: 80, recipe: { flour: 100, butter: 10, sugar: 15, eggs: 1 } },
  { key: "macaron", name: "มาการอน", price: 25, recipe: { flour: 15, butter: 8, sugar: 20, eggs: 2 } },
  { key: "choco_cake", name: "เค้กช็อคโกแลต", price: 65, recipe: { flour: 35, butter: 25, sugar: 35, eggs: 2 } },
  { key: "fruit_tart", name: "ทาร์ตผลไม้", price: 45, recipe: { flour: 40, butter: 20, sugar: 15, eggs: 1 } },
];

const currency = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

export default function Index() {
  const { branch } = useAppContext();

  const [inputs, setInputs] = useState({
    flour: 50000,
    eggs: 300,
    butter: 15000,
    sugar: 40000,
    capacity: 2000,
    profitTarget: "",
    weather: 'แดด',
    special_day: false,
  });

  const [manual, setManual] = useState(false);
  const [lastPlanId, setLastPlanId] = useState<string | null>(null);

  const productDerived = useMemo(() => {
    return PRODUCTS.map((p) => {
      const cost =
        p.recipe.flour * UNIT_COST.flour +
        p.recipe.butter * UNIT_COST.butter +
        p.recipe.sugar * UNIT_COST.sugar +
        p.recipe.eggs * UNIT_COST.eggs;
      return { ...p, cost, profitPerUnit: p.price - cost };
    });
  }, []);

  type PlanItem = {
    key: string;
    name: string;
    qty: number;
    price: number;
    profitPerUnit: number;
    recipe: { flour: number; butter: number; sugar: number; eggs: number };
    expected_leftover?: number;
    promotion?: string | null;
    selling_price?: number;
    product_cost?: number;
    gp_margin?: number;
  };

  const [plan, setPlan] = useState<PlanItem[]>(() =>
    productDerived.map((p) => ({ key: p.key, name: p.name, qty: 0, price: p.price, profitPerUnit: p.profitPerUnit, recipe: p.recipe })),
  );

  useEffect(() => {
    recalcPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usage = useMemo(() => {
    const totals = { flour: 0, eggs: 0, butter: 0, sugar: 0 };
    for (const row of plan) {
      totals.flour += row.qty * row.recipe.flour;
      totals.eggs += row.qty * row.recipe.eggs;
      totals.butter += row.qty * row.recipe.butter;
      totals.sugar += row.qty * row.recipe.sugar;
    }
    return totals;
  }, [plan]);

  const remaining = useMemo(() => ({
    flour: Math.max(0, inputs.flour - usage.flour),
    eggs: Math.max(0, inputs.eggs - usage.eggs),
    butter: Math.max(0, inputs.butter - usage.butter),
    sugar: Math.max(0, inputs.sugar - usage.sugar),
  }), [inputs, usage]);

  const totalQty = useMemo(() => plan.reduce((a, b) => a + b.qty, 0), [plan]);
  const totalProfit = useMemo(() => plan.reduce((a, b) => a + b.qty * b.profitPerUnit, 0), [plan]);

  async function recalcPlan() {
    // Call backend API to compute plan (Python model if available)
    const payload = { inputs, branch, date: new Date().toISOString(), weather: inputs.weather, special_day: inputs.special_day };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.error("/api/plan failed", resp.status, txt);
        sonner.error("เซิร์ฟเวอร์คำนวณล้มเหลว — ใช้โลคัลแทน");
        recalcLocal();
        return;
      }

      const text = await resp.text();
      if (!text) {
        console.error("Empty response from /api/plan");
        sonner.error("เซิร์ฟเวอร์ไม่ส่งข้อมูล — ใช้โลคัลแทน");
        recalcLocal();
        return;
      }

      let data: any;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse JSON from /api/plan:", text, parseErr);
        sonner.error("ข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง — ใช้โลคัลแทน");
        recalcLocal();
        return;
      }

      if (data && data.ok && data.result && data.result.plan) {
        const remotePlan = data.result.plan as any[];
        // Map remotePlan to local PlanItem[]
        const rows: PlanItem[] = productDerived.map((p) => ({ key: p.key, name: p.name, qty: 0, price: p.price, profitPerUnit: p.profitPerUnit, recipe: p.recipe }));
        for (const item of remotePlan) {
          // try match by key or name
          const keyMatch = rows.find((r) => r.key === item.key || r.name === item.product || r.key === item.product);
          if (keyMatch) {
            keyMatch.qty = item.quantity || item.qty || keyMatch.qty;
            if (item.promotion_suggestion) keyMatch.promotion = item.promotion_suggestion;
            if (item.expected_leftover !== undefined) keyMatch.expected_leftover = item.expected_leftover;
            if (item.selling_price !== undefined) keyMatch.selling_price = item.selling_price;
            if (item.product_cost !== undefined) keyMatch.product_cost = item.product_cost;
            if (item.gp_margin !== undefined) keyMatch.gp_margin = item.gp_margin;
          }
        }
        setPlan(rows);
        setLastPlanId(data.id || null);
        sonner.success("คำนวณแผนการผลิตเสร็จแล้ว");
      } else {
        console.warn("/api/plan returned unexpected payload", data);
        sonner.error("ไม่สามารถคำนวณแผ��จากเซิร์ฟเวอร์ได้ — ใช้โลคัลแทน");
        recalcLocal();
      }
    } catch (err: any) {
      clearTimeout(timeout);
      console.error("Error calling /api/plan:", err);
      if (err.name === "AbortError") {
        sonner.error("การร้องขอคำนวณใช้เวลานานเกินไป (timeout)");
      } else {
        sonner.error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ — ใช้โลคัลแทน");
      }
      recalcLocal();
    }
  }

  function recalcLocal() {
    const stock = { ...inputs } as { flour: number; eggs: number; butter: number; sugar: number; capacity: number };
    const rows: PlanItem[] = productDerived.map((p) => ({
      key: p.key,
      name: p.name,
      qty: 0,
      price: p.price,
      profitPerUnit: p.profitPerUnit,
      recipe: p.recipe,
    }));

    // Score by profit density vs resource pressure
    const scored = productDerived
      .map((p) => {
        const weight =
          (p.recipe.flour / Math.max(stock.flour, 1)) +
          (p.recipe.butter / Math.max(stock.butter, 1)) +
          (p.recipe.sugar / Math.max(stock.sugar, 1)) +
          (p.recipe.eggs / Math.max(stock.eggs, 1));
        const score = p.profitPerUnit / (weight || 1e-6);
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);

    let remainingCap = stock.capacity;

    for (const { p } of scored) {
      if (remainingCap <= 0) break;
      const maxByFlour = p.recipe.flour ? Math.floor(stock.flour / p.recipe.flour) : Infinity;
      const maxByButter = p.recipe.butter ? Math.floor(stock.butter / p.recipe.butter) : Infinity;
      const maxBySugar = p.recipe.sugar ? Math.floor(stock.sugar / p.recipe.sugar) : Infinity;
      const maxByEggs = p.recipe.eggs ? Math.floor(stock.eggs / p.recipe.eggs) : Infinity;
      let maxUnits = Math.min(maxByFlour, maxByButter, maxBySugar, maxByEggs, remainingCap);
      if (!Number.isFinite(maxUnits) || maxUnits < 0) maxUnits = 0;
      if (maxUnits <= 0) continue;

      // Allocate proportional to profit and keep buffer to avoid single product domination
      const allocate = Math.max(0, Math.floor(Math.min(maxUnits, Math.max(10, remainingCap * 0.35))));

      stock.flour -= allocate * p.recipe.flour;
      stock.butter -= allocate * p.recipe.butter;
      stock.sugar -= allocate * p.recipe.sugar;
      stock.eggs -= allocate * p.recipe.eggs;
      remainingCap -= allocate;

      const row = rows.find((r) => r.key === p.key)!;
      row.qty += allocate;
    }

    setPlan(rows);
  }

  // Load mocked outputs mimicking the Colab notebook
  function loadColabMock() {
    const mock = [
      { key: 'croissant', product: 'ครัวซองต์', quantity: 40, forecast: 34, profitPerUnit: 34.7, expected_leftover: 6, promotion_suggestion: null },
      { key: 'butter_cookie', product: 'คุกกี้เนย', quantity: 102, forecast: 85, profitPerUnit: 2.09, expected_leftover: 17, promotion_suggestion: 'โปรโมชั่นแนะนำ: ลดราคา 20%' },
      { key: 'taiwan_cake', product: 'เค้กไข่ไต้หวัน', quantity: 39, forecast: 33, profitPerUnit: 9.84, expected_leftover: 6, promotion_suggestion: null },
      { key: 'brownie', product: 'บราวนี่', quantity: 44, forecast: 37, profitPerUnit: 22.53, expected_leftover: 7, promotion_suggestion: 'โปรดจัดชุดขายคู่กับกาแฟ' },
      { key: 'pound_cake', product: 'ขนมปังปอนด์', quantity: 38, forecast: 32, profitPerUnit: 49.58, expected_leftover: 6, promotion_suggestion: 'โปรโมชั่น VIP: รับ 4 พอยต์' },
      { key: 'choco_cake', product: 'เค้กช็อคโกแลต', quantity: 39, forecast: 33, profitPerUnit: 10.58, expected_leftover: 6, promotion_suggestion: null },
      { key: 'fruit_tart', product: 'ทาร์ตผลไม้', quantity: 38, forecast: 32, profitPerUnit: 5.03, expected_leftover: 6, promotion_suggestion: null },
    ];

    const rows: PlanItem[] = productDerived.map((p) => ({ key: p.key, name: p.name, qty: 0, price: p.price, profitPerUnit: p.profitPerUnit, recipe: p.recipe }));
    for (const item of mock) {
      const match = rows.find(r => r.key === item.key || r.name === item.product || r.name === item.product);
      if (match) {
        match.qty = item.quantity;
        match.promotion = item.promotion_suggestion;
        match.expected_leftover = item.expected_leftover;
        match.profitPerUnit = item.profitPerUnit;
        match.selling_price = item.selling_price;
      }
    }
    setPlan(rows);
    setLastPlanId('colab-mock-1');
    sonner.success('โหลดตัวอย่างจาก Colab เรียบร้อย');
  }

  function handleConfirm() {
    const dateStr = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
    sonner.success(`บันทึกแผนผลิตสำเร็จ • ${branch} • ${dateStr}`);
  }

  function handleInputChange<K extends keyof typeof inputs>(key: K, value: number | string) {
    setInputs((prev) => ({ ...prev, [key]: value as never }));
  }

  function setQty(key: string, qty: number) {
    setPlan((prev) => prev.map((r) => (r.key === key ? { ...r, qty: Math.max(0, Math.floor(qty || 0)) } : r)));
  }

  const barData = plan.map((r) => ({ name: r.name, quantity: r.qty }));
  const pieData = [
    { name: TH.flour, value: usage.flour },
    { name: TH.butter, value: usage.butter },
    { name: TH.sugar, value: usage.sugar },
    { name: TH.eggs, value: usage.eggs },
  ];
  const pieColors = ["#059669", "#F97316", "#10B981", "#EAB308"]; // green/orange/emerald/amber

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">ข้อมูลนำเข้า</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Wheat className="size-4 text-primary" /> {TH.flour}</Label>
                <Input type="number" value={inputs.flour} onChange={(e) => handleInputChange("flour", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Egg className="size-4 text-primary" /> {TH.eggs}</Label>
                <Input type="number" value={inputs.eggs} onChange={(e) => handleInputChange("eggs", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><PackageOpen className="size-4 text-primary" /> {TH.butter}</Label>
                <Input type="number" value={inputs.butter} onChange={(e) => handleInputChange("butter", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Candy className="size-4 text-primary" /> {TH.sugar}</Label>
                <Input type="number" value={inputs.sugar} onChange={(e) => handleInputChange("sugar", Number(e.target.value))} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="flex items-center gap-2"><ChefHat className="size-4 text-primary" /> {TH.capacity}</Label>
                <Input type="number" value={inputs.capacity} onChange={(e) => handleInputChange("capacity", Number(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">สภาพอากาศ</Label>
                <select className="w-full rounded-md border px-3 py-2" value={inputs.weather} onChange={(e) => handleInputChange("weather", e.target.value)}>
                  <option value="แดด">แดด</option>
                  <option value="ฝน">ฝน</option>
                  <option value="ครึ้ม">ครึ้ม</option>
                  <option value="เมฆเยอะ">เมฆเยอะ</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">วันพิเศษ / โปรโมชัน</Label>
                <div className="flex items-center gap-3">
                  <input id="special" type="checkbox" checked={Boolean(inputs.special_day)} onChange={(e) => handleInputChange("special_day", e.target.checked)} />
                  <label htmlFor="special" className="text-sm text-muted-foreground">เช่น วันแม่, งานเทศกาล</label>
                </div>
              </div>

              <div className="space-y-2 col-span-2">
                <Label className="flex items-center gap-2"><CircleDollarSign className="size-4 text-primary" /> {TH.profitTarget}</Label>
                <Input placeholder="เช่น 50,000" value={inputs.profitTarget} onChange={(e) => handleInputChange("profitTarget", e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={recalcPlan}>
                <Calculator className="mr-2 size-4" /> {TH.calculate}
              </Button>
              <Button variant="outline" onClick={() => loadColabMock()}>
                โหลดตัวอย่างจาก Colab
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">สรุปภาพรวม</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SummaryStat label="จำนวนผลิตรวม" value={`${totalQty.toLocaleString()} ชิ้น`} />
              <SummaryStat label="กำไรรวมคาดการณ์" value={currency(totalProfit)} highlight />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium mb-2">ว��ตถุดิบที่จะใช้</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• {TH.flour}: {usage.flour.toLocaleString()}</li>
                  <li>• {TH.eggs}: {usage.eggs.toLocaleString()}</li>
                  <li>• {TH.butter}: {usage.butter.toLocaleString()}</li>
                  <li>• {TH.sugar}: {usage.sugar.toLocaleString()}</li>
                </ul>
              </div>
              <div>
                <div className="font-medium mb-2">วัตถุดิบที่เหลือ</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• {TH.flour}: {remaining.flour.toLocaleString()}</li>
                  <li>• {TH.eggs}: {remaining.eggs.toLocaleString()}</li>
                  <li>• {TH.butter}: {remaining.butter.toLocaleString()}</li>
                  <li>• {TH.sugar}: {remaining.sugar.toLocaleString()}</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button className="flex-1" onClick={handleConfirm}>
                <CheckCircle2 className="mr-2 size-4" /> {TH.confirm}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setManual((v) => !v)}>
                <Pencil className="mr-2 size-4" /> {TH.manual}
              </Button>
              <Button variant="secondary" onClick={recalcPlan}>
                <RotateCcw className="mr-2 size-4" /> {TH.recalc}
              </Button>

              <Button className="w-full md:w-auto" onClick={() => {
                if (!lastPlanId) return sonner.error('ยังไม่มีแผนบันทึก กรุณากด ���ำนวณ ก่อน');
                const url = `${window.location.origin}${window.location.pathname}?planId=${lastPlanId}`;
                navigator.clipboard?.writeText(url);
                sonner.success('คัดลอกลิงก์แผนไปยัง Clipboard');
              }}>
                แชร์แผน
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">ตารางแนะนำการผลิต</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>��รับเอง</span>
                <Switch checked={manual} onCheckedChange={setManual} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">เมนู</TableHead>
                  <TableHead className="text-right">จำนวนแนะนำ</TableHead>
                  <TableHead className="text-right">กำไร/หน่วย</TableHead>
                  <TableHead className="text-right">กำไรรวม</TableHead>
                  <TableHead className="text-right">คำแนะนำโปรโมชัน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">
                      {manual ? (
                        <Input
                          className="h-9 w-28 ml-auto text-right"
                          type="number"
                          value={row.qty}
                          onChange={(e) => setQty(row.key, Number(e.target.value))}
                        />
                      ) : (
                        <span>{row.qty.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{currency(row.profitPerUnit)}</TableCell>
                    <TableCell className="text-right">{currency(row.qty * row.profitPerUnit)}</TableCell>
                    <TableCell className="text-right"><div className="text-sm text-amber-700 font-medium">{row.promotion || '-'}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Row 1 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Production vs Demand Comparison</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plan.map(p=>({ name: p.name, production: p.qty, demand: (p as any).forecast || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="production" name="Production Plan" fill="#059669" />
                  <Bar dataKey="demand" name="Forecasted Demand" fill="#7C3AED" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profit per Unit Analysis</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plan.map(p=>({ name: p.name, profit: +(p.profitPerUnit||0) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="profit" fill="#10B981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Expected Total Profit by Product</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plan.map(p=>({ name: p.name, total: +(p.qty * (p.profitPerUnit||0)) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="#6B21A8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Row 2 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Production Utilization Rate</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plan.map(p=>({ name: p.name, util: ((p as any).utilization_rate||0) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis domain={[0,100]} />
                  <Tooltip />
                  <Bar dataKey="util" fill="#F59E0B" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Expected Leftover Inventory</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plan.map(p=>({ name: p.name, leftover: (p.expected_leftover||0) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="leftover" fill="#059669" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profit Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Tooltip />
                  <Pie data={plan.map(p=>({ name: p.name, value: p.qty * (p.profitPerUnit||0) }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {plan.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={["#059669","#F97316","#10B981","#6B21A8","#7C3AED","#F59E0B","#06B6D4"][idx%7]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">แผนโปรโมชันแนะนำ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {plan.filter(p=>p.promotion).length === 0 ? (
                <div className="text-sm text-muted-foreground">ไม่พบคำแนะนำโปรโมชันสำหรับแผนนี้</div>
              ) : (
                plan.filter(p=>p.promotion).map(p=> (
                  <div key={p.key} className="flex items-start gap-3 rounded-md border p-3 bg-gradient-to-r from-orange-50 to-white">
                    <div className="text-2xl">⚠️</div>
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-sm text-muted-foreground">{p.promotion}</div>
                      <div className="text-xs mt-1">คาดเหลือ: {p.expected_leftover ?? 0} ชิ้น</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-lg font-semibold " + (highlight ? "text-primary" : "")}>{value}</div>
    </div>
  );
}
