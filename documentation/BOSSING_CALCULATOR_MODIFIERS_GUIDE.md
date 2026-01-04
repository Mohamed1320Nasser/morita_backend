# 🎯 Bossing Calculator - Modifiers & Pricing Guide

## 📊 What I Fixed

### ✅ **1. Discount Column**
**Before:** Always showed "None"
**After:** Shows actual discount percentage from service modifiers

- Calculates discount from **ServiceModifier** table
- Only counts PERCENTAGE type modifiers with negative values
- Displays in **green** if discount exists: `15%`
- Shows "None" if no discount

---

### ✅ **2. Two Types of Modifiers**

Your system has **TWO modifier types**:

#### **A. ServiceModifier** (Service-Level)
- **Applies to:** ALL pricing methods for that service
- **Table:** `ServiceModifier`
- **Example:** "10% discount for all CoX methods"
- **Shows in:** Discount column

#### **B. PricingModifier** (Method-Level)
- **Applies to:** EACH specific pricing method only
- **Table:** `PricingModifier`
- **Example:** "Solo gear has +5% upcharge"
- **Shows in:** Individual tier prices

---

### ✅ **3. Payment Method Pricing**

The calculator now shows **TWO prices** for each tier:

```
🟢 $302.45  ⚪ $333.69
```

- **🟢 Green** = Cheaper payment method (e.g., OSRS Gold, Crypto)
- **⚪ White** = More expensive payment method (e.g., PayPal, Credit Card)

**How it works:**
1. Fetches ALL payment methods from database
2. Calculates price for EACH payment method
3. First method = green (usually cheapest)
4. Second method = white (usually has upcharge)

---

## 🔧 How Modifiers Are Applied

### **Calculation Flow:**

```
1. Base Price (from PricingMethod.basePrice)
   Example: $3.00/kill × 100 kills = $300.00

2. Apply Method-Level Modifiers (PricingModifier)
   Example: +10% for Solo gear = +$30.00
   Subtotal: $330.00

3. Apply Service-Level Modifiers (ServiceModifier)
   Example: -5% bulk discount = -$16.50
   Subtotal: $313.50

4. Apply Payment Method Modifiers
   Example:
   - OSRS Gold: No upcharge = $313.50 (GREEN)
   - PayPal: +10% upcharge = $344.85 (WHITE)

5. Final Prices:
   🟢 $313.50  ⚪ $344.85
```

---

## 📝 Why Prices Might Be The Same

If you see `🟢 $302.45 ⚪ $302.45` (same price), it means:

### **Possible Reasons:**

1. ✅ **No Payment Method Upcharges**
   - Your payment methods don't have different modifiers
   - Both calculate to same final price

2. ✅ **Only One Payment Method**
   - You only have 1 payment method in database
   - System duplicates it to show 2

3. ✅ **Payment Method Modifiers Not Configured**
   - Check `PaymentMethod` table
   - Make sure one has an upcharge modifier

---

## 🔍 How to Check Your Modifiers

### **1. Service-Level Modifiers (Discount Column)**

```sql
-- Check service modifiers
SELECT
  s.name as service_name,
  sm.name as modifier_name,
  sm.modifierType,
  sm.value,
  sm.displayType
FROM services s
LEFT JOIN service_modifiers sm ON s.id = sm.serviceId
WHERE s.name LIKE '%Chambers%'
AND sm.active = true;
```

**Expected Result:**
```
service_name        | modifier_name       | modifierType | value  | displayType
Chambers of Xeric   | Bulk Order Discount | PERCENTAGE   | -10.00 | DISCOUNT
```

---

### **2. Method-Level Modifiers (Individual Tiers)**

```sql
-- Check pricing method modifiers
SELECT
  pm.name as method_name,
  pmod.name as modifier_name,
  pmod.modifierType,
  pmod.value,
  pmod.displayType
FROM pricing_methods pm
LEFT JOIN pricing_modifiers pmod ON pm.id = pmod.methodId
WHERE pm.serviceId = 'your-service-id'
AND pmod.active = true;
```

**Expected Result:**
```
method_name                 | modifier_name | modifierType | value | displayType
normal Solo with Tbow+lance | Elite Worker  | PERCENTAGE   | -5.00 | DISCOUNT
normal Solo with Bofa+lance | Normal Worker | PERCENTAGE   | 0.00  | NORMAL
```

---

### **3. Payment Method Modifiers**

```sql
-- Check payment methods
SELECT
  name,
  upchargePercentage,
  active
FROM payment_methods
WHERE active = true
ORDER BY upchargePercentage ASC;
```

**Expected Result:**
```
name        | upchargePercentage | active
OSRS Gold   | 0.00              | true
Crypto      | 0.00              | true
PayPal      | 10.00             | true
Card        | 12.00             | true
```

---

## 💡 How to Set Up Different Prices

### **Option 1: Add Payment Method Upcharges**

If you want different prices for different payment methods:

```sql
-- Update PayPal to have 10% upcharge
UPDATE payment_methods
SET upchargePercentage = 10.00
WHERE name = 'PayPal';

-- Keep OSRS Gold at 0%
UPDATE payment_methods
SET upchargePercentage = 0.00
WHERE name = 'OSRS Gold';
```

**Result:**
```
🟢 $300.00 (OSRS Gold - no upcharge)
⚪ $330.00 (PayPal - 10% upcharge)
```

---

### **Option 2: Add Service-Level Discount**

To show discount in the "Discount" column:

```sql
-- Add 15% discount to Chambers of Xeric
INSERT INTO service_modifiers (serviceId, name, modifierType, value, displayType, active)
VALUES (
  'your-service-id',
  'Bulk Order Discount',
  'PERCENTAGE',
  -15.00,
  'DISCOUNT',
  true
);
```

**Result:**
```
Monster: (CoX) Chambers of Xeric  Amount: 100  Discount: 15%
```

---

### **Option 3: Add Method-Level Modifiers**

To add specific modifiers to individual tiers:

```sql
-- Add +20% upcharge for premium gear
INSERT INTO pricing_modifiers (methodId, name, modifierType, value, displayType, active)
VALUES (
  'your-method-id',
  'Premium Gear Upcharge',
  'PERCENTAGE',
  20.00,
  'UPCHARGE',
  true
);
```

**Result:**
Prices for that tier will be 20% higher.

---

## 🎨 Visual Display Breakdown

### **Header Section:**
```
🔥 Bossing Calculator                    [Dragon Image]

Monster:                   Amount  Discount
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(CoX) Chambers of Xeric      100  15%
```

- Monster name in **cyan**
- Amount in **cyan**
- Discount in **green** (if exists) or white (if none)

---

### **Tier Section:**
```
normal Solo with Tbow+lance

Notes: Per Kc
Price Per Kill: $3.00
🟢 $285.00 ⚪ $333.00
```

- Tier name in **code block**
- Notes and price in regular text
- Green circle = Cheaper payment (OSRS Gold/Crypto)
- White circle = Expensive payment (PayPal/Card)

---

## 🧪 Testing Steps

### **1. Test Modifiers Are Being Fetched**

Run `!p cox 100` and check logs:

```bash
tail -f logs/discord-bot.log | grep PvM
```

Look for:
```
[PvM] Payment Method: OSRS Gold | Base: $300.00 | Modifiers: $0.00 | Final: $300.00
[PvM] Payment Method: PayPal | Base: $300.00 | Modifiers: $30.00 | Final: $330.00
```

---

### **2. Test Discount Shows Correctly**

If you have service modifiers:
- Discount column should show percentage
- NOT "None"

---

### **3. Test Different Prices**

If payment methods have different upcharges:
- Green $ should be lower
- White $ should be higher
- NOT the same

---

## ❓ FAQ

### **Q: Why is discount always "None"?**
**A:** Your service doesn't have ServiceModifiers with negative PERCENTAGE values.

**Fix:**
```sql
INSERT INTO service_modifiers (serviceId, name, modifierType, value, displayType, active)
VALUES ('your-service-id', 'Discount', 'PERCENTAGE', -10.00, 'DISCOUNT', true);
```

---

### **Q: Why are both prices the same?**
**A:** Your payment methods don't have upcharges configured.

**Fix:**
```sql
UPDATE payment_methods SET upchargePercentage = 10.00 WHERE name = 'PayPal';
UPDATE payment_methods SET upchargePercentage = 0.00 WHERE name = 'OSRS Gold';
```

---

### **Q: How do I add upcharge to specific tiers?**
**A:** Add PricingModifiers to that tier's method.

**Fix:**
```sql
INSERT INTO pricing_modifiers (methodId, name, modifierType, value, displayType, active)
VALUES ('method-id', 'Premium Upcharge', 'PERCENTAGE', 15.00, 'UPCHARGE', true);
```

---

## 🎯 Summary

**Two Modifier Types:**
1. **ServiceModifier** → Shows in Discount column, applies to ALL methods
2. **PricingModifier** → Applies to EACH specific method only

**Two Payment Prices:**
1. **Green $** → Cheaper payment method (first in list)
2. **White $** → More expensive payment method (second in list)

**How to Test:**
```bash
# 1. Check your data
npx prisma studio

# 2. Run command
!p cox 100

# 3. Check logs
tail -f logs/discord-bot.log | grep PvM
```

---

**Your calculator is now fully functional with modifier support!** 🎉
