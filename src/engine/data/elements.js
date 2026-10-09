// The elements with their standard atomic weights, abridged to five significant figures.
// Source: IUPAC Commission on Isotopic Abundances and Atomic Weights (CIAAW), Standard Atomic Weights 2024
// (ciaaw.org/atomic-weights.htm, the 2021 report with Gd, Lu and Zr revised in 2024), cross-checked against
// the IUPAC table at iupac.qmul.ac.uk/AtWt/ on 8 Oct 2026. Interval elements (H, Li, B, C, N, O, Mg, Si, S,
// Cl, Ar, Br, Tl, Pb) carry IUPAC's conventional value. Elements with no stable isotope have no standard
// atomic weight; `iso` is the mass number of the longest-lived isotope, from the same table, and is never
// used as a weight. Fields: [Z, symbol, name, weight | null, iso | null].
export const ELEMENTS_SOURCE = 'IUPAC CIAAW Standard Atomic Weights 2024, abridged to five figures; intervals as conventional values';
export const ELEMENTS = [
  [1, 'H', 'hydrogen', 1.0080, null], [2, 'He', 'helium', 4.0026, null], [3, 'Li', 'lithium', 6.94, null], [4, 'Be', 'beryllium', 9.0122, null],
  [5, 'B', 'boron', 10.81, null], [6, 'C', 'carbon', 12.011, null], [7, 'N', 'nitrogen', 14.007, null], [8, 'O', 'oxygen', 15.999, null],
  [9, 'F', 'fluorine', 18.998, null], [10, 'Ne', 'neon', 20.180, null], [11, 'Na', 'sodium', 22.990, null], [12, 'Mg', 'magnesium', 24.305, null],
  [13, 'Al', 'aluminium', 26.982, null], [14, 'Si', 'silicon', 28.085, null], [15, 'P', 'phosphorus', 30.974, null], [16, 'S', 'sulfur', 32.06, null],
  [17, 'Cl', 'chlorine', 35.45, null], [18, 'Ar', 'argon', 39.95, null], [19, 'K', 'potassium', 39.098, null], [20, 'Ca', 'calcium', 40.078, null],
  [21, 'Sc', 'scandium', 44.956, null], [22, 'Ti', 'titanium', 47.867, null], [23, 'V', 'vanadium', 50.942, null], [24, 'Cr', 'chromium', 51.996, null],
  [25, 'Mn', 'manganese', 54.938, null], [26, 'Fe', 'iron', 55.845, null], [27, 'Co', 'cobalt', 58.933, null], [28, 'Ni', 'nickel', 58.693, null],
  [29, 'Cu', 'copper', 63.546, null], [30, 'Zn', 'zinc', 65.38, null], [31, 'Ga', 'gallium', 69.723, null], [32, 'Ge', 'germanium', 72.630, null],
  [33, 'As', 'arsenic', 74.922, null], [34, 'Se', 'selenium', 78.971, null], [35, 'Br', 'bromine', 79.904, null], [36, 'Kr', 'krypton', 83.798, null],
  [37, 'Rb', 'rubidium', 85.468, null], [38, 'Sr', 'strontium', 87.62, null], [39, 'Y', 'yttrium', 88.906, null], [40, 'Zr', 'zirconium', 91.222, null],
  [41, 'Nb', 'niobium', 92.906, null], [42, 'Mo', 'molybdenum', 95.95, null], [43, 'Tc', 'technetium', null, 97], [44, 'Ru', 'ruthenium', 101.07, null],
  [45, 'Rh', 'rhodium', 102.91, null], [46, 'Pd', 'palladium', 106.42, null], [47, 'Ag', 'silver', 107.87, null], [48, 'Cd', 'cadmium', 112.41, null],
  [49, 'In', 'indium', 114.82, null], [50, 'Sn', 'tin', 118.71, null], [51, 'Sb', 'antimony', 121.76, null], [52, 'Te', 'tellurium', 127.60, null],
  [53, 'I', 'iodine', 126.90, null], [54, 'Xe', 'xenon', 131.29, null], [55, 'Cs', 'caesium', 132.91, null], [56, 'Ba', 'barium', 137.33, null],
  [57, 'La', 'lanthanum', 138.91, null], [58, 'Ce', 'cerium', 140.12, null], [59, 'Pr', 'praseodymium', 140.91, null], [60, 'Nd', 'neodymium', 144.24, null],
  [61, 'Pm', 'promethium', null, 145], [62, 'Sm', 'samarium', 150.36, null], [63, 'Eu', 'europium', 151.96, null], [64, 'Gd', 'gadolinium', 157.25, null],
  [65, 'Tb', 'terbium', 158.93, null], [66, 'Dy', 'dysprosium', 162.50, null], [67, 'Ho', 'holmium', 164.93, null], [68, 'Er', 'erbium', 167.26, null],
  [69, 'Tm', 'thulium', 168.93, null], [70, 'Yb', 'ytterbium', 173.05, null], [71, 'Lu', 'lutetium', 174.97, null], [72, 'Hf', 'hafnium', 178.49, null],
  [73, 'Ta', 'tantalum', 180.95, null], [74, 'W', 'tungsten', 183.84, null], [75, 'Re', 'rhenium', 186.21, null], [76, 'Os', 'osmium', 190.23, null],
  [77, 'Ir', 'iridium', 192.22, null], [78, 'Pt', 'platinum', 195.08, null], [79, 'Au', 'gold', 196.97, null], [80, 'Hg', 'mercury', 200.59, null],
  [81, 'Tl', 'thallium', 204.38, null], [82, 'Pb', 'lead', 207.2, null], [83, 'Bi', 'bismuth', 208.98, null], [84, 'Po', 'polonium', null, 209],
  [85, 'At', 'astatine', null, 210], [86, 'Rn', 'radon', null, 222], [87, 'Fr', 'francium', null, 223], [88, 'Ra', 'radium', null, 226],
  [89, 'Ac', 'actinium', null, 227], [90, 'Th', 'thorium', 232.04, null], [91, 'Pa', 'protactinium', 231.04, null], [92, 'U', 'uranium', 238.03, null],
  [93, 'Np', 'neptunium', null, 237], [94, 'Pu', 'plutonium', null, 244], [95, 'Am', 'americium', null, 243], [96, 'Cm', 'curium', null, 247],
  [97, 'Bk', 'berkelium', null, 247], [98, 'Cf', 'californium', null, 251], [99, 'Es', 'einsteinium', null, 252], [100, 'Fm', 'fermium', null, 257],
  [101, 'Md', 'mendelevium', null, 258], [102, 'No', 'nobelium', null, 259], [103, 'Lr', 'lawrencium', null, 262], [104, 'Rf', 'rutherfordium', null, 267],
  [105, 'Db', 'dubnium', null, 270], [106, 'Sg', 'seaborgium', null, 269], [107, 'Bh', 'bohrium', null, 270], [108, 'Hs', 'hassium', null, 270],
  [109, 'Mt', 'meitnerium', null, 278], [110, 'Ds', 'darmstadtium', null, 281], [111, 'Rg', 'roentgenium', null, 281], [112, 'Cn', 'copernicium', null, 285],
  [113, 'Nh', 'nihonium', null, 286], [114, 'Fl', 'flerovium', null, 289], [115, 'Mc', 'moscovium', null, 289], [116, 'Lv', 'livermorium', null, 293],
  [117, 'Ts', 'tennessine', null, 293], [118, 'Og', 'oganesson', null, 294]
];
