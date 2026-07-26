export const customers = [
  { id: "c1", name: "Ravi Sharma", phone: "+91 98765 43210", area: "Indiranagar", jobs: 4, due: 2655 },
  { id: "c2", name: "Meera Nair", phone: "+91 99887 22110", area: "HSR Layout", jobs: 2, due: 0 },
  { id: "c3", name: "Aman Verma", phone: "+91 98100 11223", area: "Koramangala", jobs: 3, due: 4200 },
];

export const quotes = [
  { id: "q1", number: "QT-1028", customer: "Meera Nair", service: "Split AC installation", total: 11800, status: "SENT", date: "2026-07-25" },
  { id: "q2", number: "QT-1027", customer: "Aman Verma", service: "Annual AC maintenance", total: 5310, status: "ACCEPTED", date: "2026-07-23" },
  { id: "q3", number: "QT-1026", customer: "Ravi Sharma", service: "Compressor inspection", total: 1770, status: "DRAFT", date: "2026-07-22" },
];

export const invoices = [
  { id: "i1", number: "BD-2048", customer: "Ravi Sharma", service: "AC servicing & capacitor", total: 2655, status: "OVERDUE", due: "2026-07-24" },
  { id: "i2", number: "BD-2047", customer: "Aman Verma", service: "Annual AC maintenance", total: 4200, status: "SENT", due: "2026-07-27" },
  { id: "i3", number: "BD-2046", customer: "Meera Nair", service: "Deep clean", total: 1534, status: "PAID", due: "2026-07-18" },
];

export const activities = [
  { time: "11:10", body: "Payment reminder prepared for Ravi Sharma" },
  { time: "10:42", body: "Quote QT-1028 sent to Meera Nair" },
  { time: "Yesterday", body: "Invoice BD-2046 marked paid" },
];
