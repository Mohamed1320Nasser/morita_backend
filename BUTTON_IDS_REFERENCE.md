# Account Purchase Flow - Button/Select Menu Reference

## QUICK REFERENCE: All Interactive Components

### BROWSE ENTRY POINT
```
Initial Button (from accountShopMessage.ts)
┌─────────────────────────────────┐
│ 🛒 Browse Accounts              │
│ ID: browse_accounts             │
│ Handler: handleBrowseAccounts() │
└─────────────────────────────────┘
```

---

## CATEGORY SELECTION LAYER

### Select Menu
```
┌──────────────────────────────────────┐
│ Select account type...              │
│ ID: account_category_select         │
│ Handler: handleAccountCategorySelect │
├──────────────────────────────────────┤
│ ⚔️  Main Accounts     (15 available) │
│ 🔨 Ironman Accounts   (8 available)  │
│ 💀 HCIM Accounts      (3 available)  │
│ 🗡️  Zerker Accounts    (5 available) │
│ 🏹 Pure Accounts      (12 available) │
│ 📦 Other Accounts     (2 available)  │
└──────────────────────────────────────┘
```

### Navigation Button (Back Row)
```
┌──────────────────────────┐
│ ← Categories             │
│ ID: account_back_categories
│ Handler: handleBackToCategories
└──────────────────────────┘
```

---

## ACCOUNT LIST LAYER (Paginated)

### Select Menu
```
┌──────────────────────────────────────┐
│ Select an account to view details...│
│ ID: account_select_menu             │
│ Handler: handleAccountSelect        │
├──────────────────────────────────────┤
│ 🎮 Main 750 Total (CB 138)   $45.99  │
│ 🎮 Main 1500 Total (CB 95)   $32.50  │
│ 🎮 Main 2100 Total (CB 138)  $85.00  │
│ 🎮 Pure 40 Attack (No Magic)  $15.99  │
│ 🎮 Zerker 85 Range (No Prayer) $28.50│
└──────────────────────────────────────┘
(Max 25 accounts per select menu)
```

### Pagination Buttons
```
┌─────────┬─────────┬──────┬─────────┐
│← Categ. │ ◀ Prev  │ 1/10 │ Next ▶  │
├─────────┼─────────┼──────┼─────────┤
│ Secondary Primary  PAGE  Primary   │
│ (always) (page>1)  INFO  (page<max)
│          (disabled if (disabled  │
│           on page 1) if on last)  │
├─────────┼─────────┼──────┼─────────┤
│ back_to │ account │      │account  │
│categor  │_page_   │      │_page_   │
│ies     │MAIN_0  │      │MAIN_2   │
└─────────┴─────────┴──────┴─────────┘

IDs:
- Back to Categories: account_back_categories
  → handleBackToCategories()

- Previous Page: account_page_CATEGORY_PAGE
  Format: account_page_MAIN_1
  → handleAccountPage()

- Page Indicator: page_indicator (disabled)

- Next Page: account_page_CATEGORY_PAGE
  Format: account_page_MAIN_3
  → handleAccountPage()
```

---

## ACCOUNT DETAIL VIEW LAYER

### Action Buttons (Two Options)

#### Path A: From Select Menu
```
┌──────────────────────────────┐
│ 🛒 Purchase This Account     │
│ ID: account_purchase_ACCID   │
│ Handler: handleAccountPurchase
├──────────────────────────────┤
│ ← Back to List               │
│ ID: account_back_list_MAIN   │
│ Handler: handleBackToList    │
└──────────────────────────────┘
```

#### Path B: Direct View Details Button
```
Note: handleAccountView() also exists
but typically not used in main flow
ID: account_view_ACCID
Handler: handleAccountView()
```

---

## PURCHASE CONFIRMATION LAYER

### Confirmation Dialog
```
┌────────────────────────────────┐
│ Confirm Purchase?              │
│ Account: Main 750 Total        │
│ Price: $45.99                  │
│ ⚠️  By confirming, the account │
│    will be reserved for you.   │
├────────────────────────────────┤
│ ✅ Confirm Purchase│❌ Cancel  │
└────────────────────────────────┘

IDs:
- Confirm: account_confirm_ACCID
  → handleAccountConfirm()
  
- Cancel: account_cancel
  → handleAccountCancel()
```

---

## TICKET CHANNEL WELCOME LAYER

### Customer Action Buttons
```
┌────────────────────────────────┐
│ 🎮 Account Purchase Ticket #0042
│                                │
│ ✅ Account reserved for 30 min │
│                                │
│ Next Steps:                    │
│ 1️⃣  Send payment               │
│ 2️⃣  Click "Payment Sent"       │
│ 3️⃣  Receive credentials        │
├────────────────────────────────┤
│💳 Payment Sent │❌ Cancel Order│
│           │🔒 Close Ticket     │
├────────────────────────────────┤
│ IDs:                           │
│ Payment Sent:                  │
│   account_payment_sent_TICKID  │
│   → handleAccountPaymentSent   │
│                                │
│ Cancel Order:                  │
│   account_cancel_order_TICKID  │
│   → handleAccountCancelOrder   │
│                                │
│ Close Ticket:                  │
│   ticket_close_TICKID          │
│   (Generic handler)            │
└────────────────────────────────┘
```

---

## PAYMENT NOTIFICATION LAYER (After Customer Clicks "Payment Sent")

### Staff Notification Message
```
┌────────────────────────────────┐
│ 💳 Payment Notification        │
│                                │
│ @support Payment notification! │
│                                │
│ <@USER> has marked their       │
│ payment as sent.               │
│                                │
│ Staff Action Required:         │
│ Verify payment & deliver       │
│ credentials.                   │
├────────────────────────────────┤
│✅ Confirm  │📦 Deliver  │     │
│ Payment    │Account     │     │
│            │            │     │
│🔓 Release  │❌ Cancel & │     │
│Account     │Refund      │     │
├────────────────────────────────┤
│ IDs:                           │
│ Confirm Payment:               │
│   account_confirm_payment_     │
│   TICKID                       │
│   → handleAccountConfirmPayment
│                                │
│ Deliver Account:               │
│   account_deliver_TICKID_ACCID │
│   → handleAccountDeliver       │
│   → Shows credentials modal    │
│                                │
│ Release Account:               │
│   account_release_ACCID        │
│   → handleAccountRelease       │
│                                │
│ Cancel & Refund:               │
│   account_cancel_order_TICKID  │
│   → handleAccountCancelOrder   │
└────────────────────────────────┘
```

---

## DELIVERY CREDENTIALS MODAL LAYER

### Modal Form (Shown by handleAccountDeliver)
```
┌─────────────────────────────────┐
│ Deliver Account Credentials     │
├─────────────────────────────────┤
│ Email/Username (required)       │
│ [user@example.com             ] │
├─────────────────────────────────┤
│ Password (required)             │
│ [••••••••                      ] │
├─────────────────────────────────┤
│ Bank PIN (optional)             │
│ [1234                         ] │
├─────────────────────────────────┤
│ Additional Info (optional)      │
│ [Quests completed...          ] │
│                                 │
├─────────────────────────────────┤
│ [Submit] [Cancel]               │
└─────────────────────────────────┘

Modal ID: account_delivery_modal_TICKID
Handler: handleAccountDeliveryModal()

Form Fields:
- account_email (required, max 255)
- account_password (required, max 100)
- account_bank_pin (optional, max 10)
- account_additional_info (optional, max 500)
```

---

## POST-DELIVERY LAYER (INCOMPLETE)

### Planned Post-Delivery Buttons
```
⭐ Leave Review
   ID: account_leave_review_ORDERID
   Handler: NOT IMPLEMENTED

📋 Close Ticket
   ID: account_close_ticket_TICKID
   Handler: Uses generic ticket_close_
   Status: INCOMPLETE
```

---

## ALTERNATE FLOW: PAYMENT METHOD SELECTION

### Select Menu (CURRENTLY NON-FUNCTIONAL)
```
┌──────────────────────────────────┐
│ Select payment method...         │
│ ID: account_payment_select       │
│ Handler: handleAccountPaymentSelect
├──────────────────────────────────┤
│ 💳 Bank Transfer                 │
│ 💎 Bitcoin                       │
│ 💎 Ethereum                      │
│ 💳 PayPal                        │
└──────────────────────────────────┘

STATUS: TODO
Comment: "Integrate with ticket creation in Phase 7"
Current behavior: Shows ephemeral message only
Needed: Show payment details, save selection to ticket
```

---

## HANDLER REGISTRATION MAP

```
File: interactions/buttons/index.ts (lines 252-312)

Account-related button patterns:
├─ account_page_*           → handleAccountPage
├─ account_view_*           → handleAccountView  
├─ account_purchase_*       → handleAccountPurchase
├─ account_back_list_*      → handleBackToList
├─ account_confirm_*        → handleAccountConfirm
├─ account_payment_sent_*   → handleAccountPaymentSent
├─ account_cancel_order_*   → handleAccountCancelOrder
├─ account_confirm_payment_ → handleAccountConfirmPayment
├─ account_deliver_*        → handleAccountDeliver
└─ account_release_*        → handleAccountRelease

Main object handlers (not prefixed):
├─ browse_accounts          → handleBrowseAccounts
├─ account_back_categories  → handleBackToCategories
└─ account_cancel           → handleAccountCancel
```

```
File: interactions/selectMenus/index.ts (lines 27-31)

Select menu handlers:
├─ account_category_select  → handleAccountCategorySelect
├─ account_select_menu      → handleAccountSelect
└─ account_payment_select   → handleAccountPaymentSelect (TODO)
```

```
File: interactions/modals/index.ts (lines 83-85)

Modal pattern handlers:
└─ /^account_delivery_modal_/ → handleAccountDeliveryModal
```

---

## ID PARSING PATTERNS

### Variable Suffixes Used

1. **ACCID**: Account ID (UUID or database ID)
   - Example: `account_view_550e8400-e29b-41d4-a716-446655440000`

2. **TICKID**: Ticket ID (UUID or database ID)
   - Example: `account_payment_sent_550e8400`

3. **CATEGORY**: Account category code
   - Example: `account_page_MAIN_2`
   - Values: MAIN, IRONS, HCIM, ZERK, PURE, ACCOUNTS

4. **PAGE**: Page number (integer)
   - Example: `account_page_MAIN_2`
   - Values: 1, 2, 3, etc.

5. **ORDERID**: Order ID (for review)
   - Example: `account_leave_review_12345`

---

## CRITICAL CUSTOM ID FORMATS

```
Pagination Button:
  Format:  account_page_{CATEGORY}_{PAGE_NUMBER}
  Example: account_page_MAIN_2
  Parser:  customId.split("_") → [account, page, category, pageNum]

Detail Button (Fragile - uses split):
  Format:  account_deliver_{TICKID}_{ACCID}
  Example: account_deliver_ticket123_account456
  Parser:  customId.split("_") → parts[2]=tickId, parts[3]=accId
  Issue:   ⚠️ Brittle if format changes

Most Buttons (Robust - uses replace):
  Format:  {PREFIX}{ID}
  Example: account_purchase_account123
  Parser:  customId.replace(PREFIX, "")
  Advantage: Works even if ID has underscores
```

---

## UNUSED/INCOMPLETE COMPONENTS

```
Defined but NOT used:
1. PAYMENT_PREFERENCE modal ID
   Location: accountComponentBuilder.ts:44
   Status: Dead code

2. CANCEL_REASON modal ID  
   Location: accountComponentBuilder.ts:46
   Status: Dead code
   
3. createCancelReasonModal function
   Location: accountComponentBuilder.ts:389-409
   Status: Never called

4. createPaymentSelectMenu function
   Location: accountComponentBuilder.ts:231-252
   Status: Component exists but handler incomplete

5. createPostDeliveryButtons function
   Location: accountComponentBuilder.ts:317-331
   Status: Buttons created but no handlers
```

---

## SECURITY CONSIDERATIONS

### Permission Checks Missing
- ❌ handleAccountConfirmPayment() - No role check
- ❌ handleAccountDeliver() - No role check
- ❌ handleAccountRelease() - No role check
- ✅ handleAccountPaymentSent() - OK (customer action)
- ✅ handleAccountPurchase() - OK (customer action)

### Injection Risks
- ⚠️ Modal input fields not validated (email, password)
- ⚠️ Custom ID parsing uses array indexing

### Race Conditions
- ⚠️ Between purchase initiation and confirmation
- ⚠️ Between payment sent and payment confirmation

---

## FLOW STATISTICS

Total Handlers: 13 button handlers
- Complete/Working: 10
- Incomplete/TODO: 2 (payment select, post-delivery)
- Missing: 1 (confirm delivery)

Total Select Menus: 3
- Complete/Working: 2
- Incomplete/TODO: 1 (payment select)

Total Modals: 1
- Complete/Working: 1
- Unused: 2 modal IDs

Total Database Updates: 0 (This is the main issue!)
- Should be 3-4 critical updates

