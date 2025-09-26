#!/usr/bin/env python3
import sys
import json
from datetime import datetime

# Lightweight model runner: reads JSON from stdin and outputs JSON to stdout
# Avoid heavy dependencies so it's easier to run. Uses heuristics similar to JS fallback.

def read_input():
    try:
        data = sys.stdin.read()
        if not data:
            return {}
        return json.loads(data)
    except Exception as e:
        return {}


def main():
    payload = read_input()
    inputs = payload.get('inputs', {})
    branch = payload.get('branch', 'สาขา A')
    date_str = payload.get('date')
    weather = payload.get('weather', 'แดด')
    special = payload.get('special_day', False)

    if date_str:
        try:
            date = datetime.fromisoformat(date_str)
        except:
            date = datetime.now()
    else:
        date = datetime.now()

    PRODUCTS = [
        {'key': 'croissant', 'name': 'ครัวซองต์', 'price': 50, 'recipe': {'flour':50,'butter':30,'sugar':10,'eggs':1}, 'base':120},
        {'key': 'butter_cookie', 'name': 'คุกกี้เนย', 'price': 15, 'recipe': {'flour':20,'butter':15,'sugar':10,'eggs':0}, 'base':300},
        {'key': 'taiwan_cake', 'name': 'เค้กไข่ไต้หวัน', 'price': 40, 'recipe': {'flour':30,'butter':5,'sugar':25,'eggs':2}, 'base':80},
        {'key': 'brownie', 'name': 'บราวนี่', 'price': 55, 'recipe': {'flour':25,'butter':20,'sugar':30,'eggs':1}, 'base':90},
        {'key': 'pound_cake', 'name': 'ขนมปังปอนด์', 'price': 80, 'recipe': {'flour':100,'butter':10,'sugar':15,'eggs':1}, 'base':60},
        {'key': 'macaron', 'name': 'มาการอน', 'price': 25, 'recipe': {'flour':15,'butter':8,'sugar':20,'eggs':2}, 'base':45},
        {'key': 'choco_cake', 'name': 'เค้กช็อคโกแลต', 'price': 65, 'recipe': {'flour':35,'butter':25,'sugar':35,'eggs':2}, 'base':70},
        {'key': 'fruit_tart', 'name': 'ทาร์ตผลไม้', 'price': 45, 'recipe': {'flour':40,'butter':20,'sugar':15,'eggs':1}, 'base':55},
    ]

    weatherMul = {'แดด':1.1, 'ฝน':0.7, 'ครึ้ม':0.9, 'เมฆเยอะ':0.95}
    dayMul = 1.2 if date.weekday() >=5 else 1.0
    specialMul = 1.3 if special else 1.0
    branchMul = {'สาขา A':1.0,'สาขา B':1.2,'สาขา C':0.8}.get(branch,1.0)

    forecast = {}
    for p in PRODUCTS:
        base = p['base']
        pred = max(0, int(round(base * dayMul * weatherMul.get(weather,1.0) * specialMul * branchMul * 0.3)))
        forecast[p['name']] = pred

    stock = {
        'flour': int(inputs.get('flour', 50000)),
        'butter': int(inputs.get('butter', 15000)),
        'sugar': int(inputs.get('sugar', 40000)),
        'eggs': int(inputs.get('eggs', 300)),
    }
    capacity = int(inputs.get('capacity', 2000))

    UNIT_COST = {'flour':0.05,'butter':0.2,'sugar':0.04,'eggs':5}

    # simple allocation
    scored = []
    for p in PRODUCTS:
        cost = p['recipe']['flour']*UNIT_COST['flour'] + p['recipe']['butter']*UNIT_COST['butter'] + p['recipe']['sugar']*UNIT_COST['sugar'] + p['recipe']['eggs']*UNIT_COST['eggs']
        profit = p['price'] - cost
        weight = (p['recipe']['flour']/max(stock['flour'],1)) + (p['recipe']['butter']/max(stock['butter'],1)) + (p['recipe']['sugar']/max(stock['sugar'],1)) + (p['recipe']['eggs']/max(stock['eggs'],1))
        score = profit / (weight if weight>0 else 1e-6)
        scored.append({'p':p,'score':score,'profit':profit})

    scored.sort(key=lambda x: x['score'], reverse=True)

    plan = []
    for entry in scored:
        if capacity<=0:
            break
        p = entry['p']
        maxByFlour = p['recipe']['flour'] and stock['flour']//p['recipe']['flour'] or float('inf')
        maxByButter = p['recipe']['butter'] and stock['butter']//p['recipe']['butter'] or float('inf')
        maxBySugar = p['recipe']['sugar'] and stock['sugar']//p['recipe']['sugar'] or float('inf')
        maxByEggs = p['recipe']['eggs'] and stock['eggs']//p['recipe']['eggs'] or float('inf')
        maxUnits = min(maxByFlour, maxByButter, maxBySugar, maxByEggs, capacity)
        if not (maxUnits and maxUnits>0):
            continue
        allocate = max(0, min(int(maxUnits), max(10, int(capacity*0.35))))
        stock['flour'] -= allocate * p['recipe']['flour']
        stock['butter'] -= allocate * p['recipe']['butter']
        stock['sugar'] -= allocate * p['recipe']['sugar']
        stock['eggs'] -= allocate * p['recipe']['eggs']
        capacity -= allocate
        expected_leftover = max(0, allocate - forecast.get(p['name'], 0))
        gp_margin = round((p['price'] - cost) / p['price'] if p['price']>0 else 0, 2)
        promo = None
        # Promotion rules
        if forecast.get(p['name'],0) > 0 and expected_leftover / max(1, forecast.get(p['name'],0)) > 0.3:
            promo = f"โปรโมชั่นแนะนำ: ��ดราคา 20%"
        elif special:
            promo = f"โปรดจัดชุดขายคู่กับกาแฟ"
        elif expected_leftover>0 and expected_leftover > 10:
            promo = f"เร่งขาย เพราะวัตถุดิบอาจใกล้หมด"

        plan.append({
            'product':p['name'],
            'key':p['key'],
            'quantity':allocate,
            'profitPerUnit': entry['profit'],
            'expected_leftover': expected_leftover,
            'selling_price': p['price'],
            'product_cost': round(cost,2),
            'gp_margin': gp_margin,
            'promotion_suggestion': promo
        })

    output = {'forecast':forecast,'plan':plan,'remainingStock':stock}
    print(json.dumps(output))

if __name__ == '__main__':
    main()
