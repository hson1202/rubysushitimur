/**
 * Import menu.txt into MongoDB.
 * - Creates missing categories (no duplicates)
 * - Splits dual prices into two products (no variants)
 * - Maps allergen letters a–n case-insensitively
 *
 * Usage (from Backend folder):
 *   node scripts/importMenuTxt.js --dry-run
 *   node scripts/importMenuTxt.js --wipe
 *   node scripts/importMenuTxt.js
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import categoryModel from '../models/categoryModel.js'
import foodModel from '../models/foodModel.js'
import { mapAllergenCodes } from '../utils/allergens.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MENU_PATH = path.resolve(__dirname, '../../menu.txt')

const DRY_RUN = process.argv.includes('--dry-run')
const WIPE = process.argv.includes('--wipe') || process.argv.includes('--replace-all')

const CATEGORIES = [
  { source: 'Khai Vị & Ăn Nhẹ', nameHU: 'Előételek', nameEN: 'Starters & Snacks', nameVI: 'Khai vị & Ăn nhẹ', sortOrder: 1 },
  { source: 'Súp', nameHU: 'Levesek', nameEN: 'Soups', nameVI: 'Súp', sortOrder: 2 },
  { source: 'Salad', nameHU: 'Saláták', nameEN: 'Salads', nameVI: 'Salad', sortOrder: 3 },
  { source: 'Phở - Ramen - Udon', nameHU: 'Pho - Ramen - Udon', nameEN: 'Pho - Ramen - Udon', nameVI: 'Phở - Ramen - Udon', sortOrder: 4 },
  { source: 'Bún - Mì - Pad Thai', nameHU: 'Bun - Tészta - Pad Thai', nameEN: 'Bun - Noodles - Pad Thai', nameVI: 'Bún - Mì - Pad Thai', sortOrder: 5 },
  { source: 'Các Món Cơm', nameHU: 'Rizses ételek', nameEN: 'Rice dishes', nameVI: 'Các món cơm', sortOrder: 6 },
  { source: 'Sushi Các Loại', nameHU: 'Sushi', nameEN: 'Sushi', nameVI: 'Sushi các loại', sortOrder: 7 },
  { source: 'Uramaki', nameHU: 'Uramaki', nameEN: 'Uramaki', nameVI: 'Uramaki', sortOrder: 8 },
  { source: 'Sushi Set', nameHU: 'Sushi szettek', nameEN: 'Sushi sets', nameVI: 'Sushi set', sortOrder: 9 },
]

const HAS_VI = /[ăâêôơưđáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i

const HU_TO_EN = [
  [/Zöldséges tavaszi tekercs/gi, 'Vegetable spring roll'],
  [/Tavaszi tekercs/gi, 'Spring roll'],
  [/Nyári Tekercs/gi, 'Summer roll'],
  [/Gőzölt rákos Dimsum/gi, 'Steamed shrimp dimsum'],
  [/Sült sertés Dimsum/gi, 'Fried pork dimsum'],
  [/Vegetáriánus sült Dimsum/gi, 'Vegetarian fried dimsum'],
  [/Panírozott rák/gi, 'Tempura shrimp'],
  [/Panírozott lazac/gi, 'Tempura salmon'],
  [/Hal pogácsa/gi, 'Fish cake'],
  [/Rák pogácsa/gi, 'Shrimp cake'],
  [/Főtt edamame szója bab/gi, 'Boiled edamame'],
  [/Rántott csirkemell/gi, 'Tempura chicken'],
  [/Rántott avokádó/gi, 'Tempura avocado'],
  [/Rántott lazac/gi, 'Tempura salmon'],
  [/Sült burgonya/gi, 'Fried potatoes'],
  [/Miso Japán Leves/gi, 'Miso Japanese soup'],
  [/Dumpling leves/gi, 'Dumpling soup'],
  [/Tojásleves/gi, 'Egg drop soup'],
  [/Ruby special leves/gi, 'Ruby special soup'],
  [/Mangó Saláta/gi, 'Mango salad'],
  [/Avokádó Saláta/gi, 'Avocado salad'],
  [/Wakame saláta/gi, 'Wakame salad'],
  [/Udon Leves/gi, 'Udon soup'],
  [/Pirított Tészta/gi, 'Fried noodles'],
  [/Sült Rizs/gi, 'Fried rice'],
  [/Édes-Savanyú Szószos Rizs/gi, 'Sweet & sour sauce rice'],
  [/Mogyoró Szószos Rizs/gi, 'Peanut sauce rice'],
  [/Hoisin Szószos Rizs/gi, 'Hoisin sauce rice'],
  [/Thai Csípős Szószos Rizs/gi, 'Thai spicy sauce rice'],
  [/Thai Csípős Sült Rizs/gi, 'Thai spicy fried rice'],
  [/Zöld Curry Udon Tésztával/gi, 'Green curry with udon'],
  [/Zöld Curry Rizzsel/gi, 'Green curry with rice'],
  [/Teriyaki csirke/gi, 'Teriyaki chicken'],
  [/Zöldségek & Tofu/gi, 'Vegetables & Tofu'],
  [/Csirke avokádó/gi, 'Chicken avocado'],
  [/Tenger gyümölcseivel/gi, 'Seafood'],
  [/Sült Csirke/gi, 'Fried chicken'],
  [/Sült csirke/gi, 'Fried chicken'],
  [/Sült Kacsa/gi, 'Fried duck'],
  [/Sült kacsa/gi, 'Fried duck'],
  [/Füstölt Lazac/gi, 'Smoked salmon'],
  [/Füstölt lazac/gi, 'Smoked salmon'],
  [/Füstölt Tonhal/gi, 'Smoked tuna'],
  [/Füstölt tonhal/gi, 'Smoked tuna'],
  [/Vörös tonhal/gi, 'Red tuna'],
  [/Tigris rák/gi, 'Tiger shrimp'],
  [/Fűszeres Lazac/gi, 'Spicy salmon'],
  [/Fűszeres Tonhal/gi, 'Spicy tuna'],
  [/Fűszeres Surimi/gi, 'Spicy surimi'],
  [/Masago Kaviár/gi, 'Masago caviar'],
  [/Masago kaviár/gi, 'Masago caviar'],
  [/Lazac Kaviár/gi, 'Salmon caviar'],
  [/Lazac avokádó/gi, 'Salmon avocado'],
  [/Angolna kifordított maki/gi, 'Eel inside-out maki'],
  [/Kifordított/gi, 'inside-out'],
  [/Sült Vega/gi, 'Fried veggie'],
  [/sült lazac/gi, 'fried salmon'],
  [/sült futomaki/gi, 'fried futomaki'],
  [/sült Csirke/gi, 'fried chicken'],
  [/omlett/gi, 'omelette'],
  [/Lazac uramaki/gi, 'Salmon uramaki'],
  [/Tonhal Uramaki/gi, 'Tuna uramaki'],
  [/Tonhal uramaki/gi, 'Tuna uramaki'],
  [/Avokádó uramaki/gi, 'Avocado uramaki'],
  [/Hamachi uramaki/gi, 'Hamachi uramaki'],
  [/Tempura rák/gi, 'Tempura shrimp'],
  [/Garnélarák/gi, 'Shrimp'],
  [/Zöldségek/gi, 'Vegetables'],
  [/Vegyes/gi, 'Mixed'],
  [/Kifordított/gi, 'inside-out'],
  [/kicsi/gi, 'small'],
  [/\(2db\)/gi, '(2 pcs)'],
  [/\(5db\)/gi, '(5 pcs)'],
  [/\(6db\)/gi, '(6 pcs)'],
  [/Marha/g, 'Beef'],
  [/Csirke/g, 'Chicken'],
  [/Lazac/g, 'Salmon'],
  [/Tonhal/g, 'Tuna'],
  [/Uborka/g, 'Cucumber'],
  [/Avokádó/g, 'Avocado'],
  [/Angolna/g, 'Eel'],
  [/Sertés/g, 'Pork'],
  [/Mangó/g, 'Mango'],
  [/lazac/gi, 'salmon'],
  [/tonhal/gi, 'tuna'],
  [/rák/gi, 'shrimp'],
]

const EN_TO_VI = [
  [/Vegetable spring roll \(small\)/gi, 'Chả giò rau củ (nhỏ)'],
  [/Vegetables spring roll \(small\)/gi, 'Chả giò rau củ (nhỏ)'],
  [/Steamed shrimp [Dd]imsum/g, 'Há cảo tôm hấp'],
  [/Fried pork [Dd]imsum/g, 'Há cảo thịt heo chiên'],
  [/Vegetarian fried [Dd]imsum/g, 'Há cảo chay chiên'],
  [/Miso Japanese soup/gi, 'Súp miso Nhật'],
  [/Ruby special soup/gi, 'Súp đặc biệt Ruby'],
  [/Dumpling soup/gi, 'Súp há cảo'],
  [/Egg drop soup/gi, 'Súp trứng'],
  [/Fried chicken salad/gi, 'Salad gà chiên'],
  [/Fried [Dd]uck salad/gi, 'Salad vịt chiên'],
  [/Vegetarian salad/gi, 'Salad chay'],
  [/Chicken salad/gi, 'Salad gà'],
  [/Beef salad/gi, 'Salad bò'],
  [/Shrimp salad/gi, 'Salad tôm'],
  [/Wakame salad/gi, 'Salad wakame'],
  [/Avocado salad/gi, 'Salad bơ'],
  [/Mango salad/gi, 'Salad xoài'],
  [/Maki nigiri set/gi, 'Set maki nigiri'],
  [/Maki set/gi, 'Set maki'],
  [/Sake set/gi, 'Set sake'],
  [/Fire set/gi, 'Set Fire'],
  [/Vega set/gi, 'Set chay'],
  [/Sushi imádó/gi, 'Set người mê sushi'],
  [/Crunchy set/gi, 'Set giòn'],
  [/Happy set/gi, 'Set Happy'],
  [/Ruby party set/gi, 'Set Ruby party'],
  [/Ruby set 2/gi, 'Set Ruby 2'],
  [/Ruby set/gi, 'Set Ruby'],
  [/I\.O\. set/gi, 'Set uramaki'],
  [/inside-out/gi, 'uramaki'],
  [/fried salmon/gi, 'cá hồi chiên'],
  [/fried veggie/gi, 'chay chiên'],
  [/fried chicken/gi, 'gà chiên'],
  [/Summer roll/gi, 'Gỏi cuốn'],
  [/Spring roll/gi, 'Chả giò'],
  [/Tempura Shrimp/gi, 'Tôm tempura'],
  [/Tempura shrimp/gi, 'Tôm tempura'],
  [/Tempura salmon/gi, 'Cá hồi tempura'],
  [/Tempura chicken/gi, 'Gà tempura'],
  [/Tempura avocado/gi, 'Bơ tempura'],
  [/Fish cake/gi, 'Chả cá'],
  [/Shrimp cake/gi, 'Chả tôm'],
  [/Edamame soy beans/gi, 'Đậu nành edamame'],
  [/Boiled edamame/gi, 'Đậu nành edamame luộc'],
  [/Fried potatoes/gi, 'Khoai tây chiên'],
  [/Pho Special/gi, 'Phở đặc biệt'],
  [/Pho Fried chicken/gi, 'Phở gà chiên'],
  [/Pho fried Duck/gi, 'Phở vịt chiên'],
  [/Pho Chicken/gi, 'Phở gà'],
  [/Pho Shrimp/gi, 'Phở tôm'],
  [/Pho Beef/gi, 'Phở bò'],
  [/Fried noodles/gi, 'Mì xào'],
  [/Fried Rice/gi, 'Cơm chiên'],
  [/Fried Noodle/gi, 'Mì xào'],
  [/Teriyaki chicken/gi, 'Gà teriyaki'],
  [/Sweet & sour sauce rice/gi, 'Cơm sốt chua ngọt'],
  [/Peanut sauce rice/gi, 'Cơm sốt đậu phộng'],
  [/Hoisin sauce rice/gi, 'Cơm sốt hoisin'],
  [/Thai spicy sauce rice/gi, 'Cơm sốt cay Thái'],
  [/Thai spicy fried rice/gi, 'Cơm chiên cay Thái'],
  [/Green curry with udon/gi, 'Cà ri xanh với mì udon'],
  [/Green curry with rice/gi, 'Cà ri xanh với cơm'],
  [/Vegetables & Tofu/gi, 'Rau củ & đậu phụ'],
  [/Chicken avocado/gi, 'Gà bơ'],
  [/Smoked salmon/gi, 'Cá hồi xông khói'],
  [/Smoked tuna/gi, 'Cá ngừ xông khói'],
  [/Red tuna/gi, 'Cá ngừ đỏ'],
  [/Tiger shrimp/gi, 'Tôm sú'],
  [/Spicy salmon/gi, 'Cá hồi cay'],
  [/Spicy tuna/gi, 'Cá ngừ cay'],
  [/Spicy surimi/gi, 'Surimi cay'],
  [/Masago caviar/gi, 'Trứng cá masago'],
  [/Salmon caviar/gi, 'Trứng cá hồi'],
  [/Salmon avocado/gi, 'Cá hồi bơ'],
  [/Eel inside-out maki/gi, 'Uramaki lươn'],
  [/Salmon uramaki/gi, 'Uramaki cá hồi'],
  [/Tuna uramaki/gi, 'Uramaki cá ngừ'],
  [/Avocado uramaki/gi, 'Uramaki bơ'],
  [/Hamachi uramaki/gi, 'Uramaki hamachi'],
  [/Udon soup/gi, 'Súp udon'],
  [/Fried chicken/gi, 'Gà chiên'],
  [/Fried duck/gi, 'Vịt chiên'],
  [/Fried Duck/gi, 'Vịt chiên'],
  [/Vegetarian/gi, 'Chay'],
  [/Vegetables/gi, 'Rau củ'],
  [/Seafood/gi, 'Hải sản'],
  [/Cucumber/gi, 'Dưa chuột'],
  [/Avocado/gi, 'Bơ'],
  [/Salmon/gi, 'Cá hồi'],
  [/Shrimp/gi, 'Tôm'],
  [/Chicken/gi, 'Gà'],
  [/Tofu/gi, 'Đậu phụ'],
  [/Tuna/gi, 'Cá ngừ'],
  [/Beef/gi, 'Bò'],
  [/Pork/gi, 'Heo'],
  [/Eel/gi, 'Lươn'],
  [/Mango/gi, 'Xoài'],
  [/Mixed/gi, 'Thập cẩm'],
  [/\((\d+)\s*pcs\)/gi, '($1 cái)'],
  [/\((\d+)\s*db\)/gi, '($1 cái)'],
  [/\(small\)/gi, '(nhỏ)'],
]

const HU_TO_VI = [
  [/Zöldséges tavaszi tekercs/gi, 'Chả giò rau củ'],
  [/Tavaszi tekercs/gi, 'Chả giò'],
  [/Nyári Tekercs/gi, 'Gỏi cuốn'],
  [/Gőzölt rákos Dimsum/gi, 'Há cảo tôm hấp'],
  [/Sült sertés Dimsum/gi, 'Há cảo thịt heo chiên'],
  [/Vegetáriánus sült Dimsum/gi, 'Há cảo chay chiên'],
  [/Panírozott rák/gi, 'Tôm tempura'],
  [/Panírozott lazac/gi, 'Cá hồi tempura'],
  [/Hal pogácsa/gi, 'Chả cá'],
  [/Rák pogácsa/gi, 'Chả tôm'],
  [/Főtt edamame szója bab/gi, 'Đậu nành edamame luộc'],
  [/Rántott csirkemell/gi, 'Ức gà tempura'],
  [/Rántott avokádó/gi, 'Bơ tempura'],
  [/Rántott lazac/gi, 'Cá hồi tempura'],
  [/Sült burgonya/gi, 'Khoai tây chiên'],
  [/Miso Japán Leves/gi, 'Súp miso Nhật'],
  [/Dumpling leves/gi, 'Súp há cảo'],
  [/Tojásleves/gi, 'Súp trứng'],
  [/Ruby special leves/gi, 'Súp đặc biệt Ruby'],
  [/Mangó Saláta/gi, 'Salad xoài'],
  [/Avokádó Saláta/gi, 'Salad bơ'],
  [/Wakame saláta/gi, 'Salad wakame'],
  [/Udon Leves/gi, 'Súp udon'],
  [/Pirított Tészta/gi, 'Mì xào'],
  [/Sült Rizs/gi, 'Cơm chiên'],
  [/Édes-Savanyú Szószos Rizs/gi, 'Cơm sốt chua ngọt'],
  [/Mogyoró Szószos Rizs/gi, 'Cơm sốt đậu phộng'],
  [/Hoisin Szószos Rizs/gi, 'Cơm sốt hoisin'],
  [/Thai Csípős Szószos Rizs/gi, 'Cơm sốt cay Thái'],
  [/Thai Csípős Sült Rizs/gi, 'Cơm chiên cay Thái'],
  [/Zöld Curry Udon Tésztával/gi, 'Cà ri xanh với mì udon'],
  [/Zöld Curry Rizzsel/gi, 'Cà ri xanh với cơm'],
  [/Teriyaki csirke/gi, 'Gà teriyaki'],
  [/Zöldségek & Tofu/gi, 'Rau củ & đậu phụ'],
  [/Csirke avokádó/gi, 'Gà bơ'],
  [/Tenger gyümölcseivel/gi, 'Hải sản'],
  [/Sült Csirke/gi, 'Gà chiên'],
  [/Sült csirke/gi, 'Gà chiên'],
  [/Sült Kacsa/gi, 'Vịt chiên'],
  [/Sült kacsa/gi, 'Vịt chiên'],
  [/Füstölt Lazac/gi, 'Cá hồi xông khói'],
  [/Füstölt lazac/gi, 'Cá hồi xông khói'],
  [/Füstölt Tonhal/gi, 'Cá ngừ xông khói'],
  [/Füstölt tonhal/gi, 'Cá ngừ xông khói'],
  [/Vörös tonhal/gi, 'Cá ngừ đỏ'],
  [/Tigris rák/gi, 'Tôm sú'],
  [/Fűszeres Lazac/gi, 'Cá hồi cay'],
  [/Fűszeres Tonhal/gi, 'Cá ngừ cay'],
  [/Fűszeres Surimi/gi, 'Surimi cay'],
  [/Masago Kaviár/gi, 'Trứng cá masago'],
  [/Masago kaviár/gi, 'Trứng cá masago'],
  [/Lazac Kaviár/gi, 'Trứng cá hồi'],
  [/Lazac avokádó/gi, 'Cá hồi bơ'],
  [/Angolna kifordított maki/gi, 'Uramaki lươn'],
  [/Lazac uramaki/gi, 'Uramaki cá hồi'],
  [/Tonhal Uramaki/gi, 'Uramaki cá ngừ'],
  [/Tonhal uramaki/gi, 'Uramaki cá ngừ'],
  [/Avokádó uramaki/gi, 'Uramaki bơ'],
  [/Hamachi uramaki/gi, 'Uramaki hamachi'],
  [/Tempura rák/gi, 'Tôm tempura'],
  [/Garnélarák/gi, 'Tôm'],
  [/Zöldségek/gi, 'Rau củ'],
  [/Vegyes/gi, 'Thập cẩm'],
  [/Pho Special/gi, 'Phở đặc biệt'],
  [/\(2db\)/gi, '(2 cái)'],
  [/\(5db\)/gi, '(5 cái)'],
  [/\(6db\)/gi, '(6 cái)'],
  [/\(kicsi\)/gi, '(nhỏ)'],
  [/Marha/g, 'Bò'],
  [/Csirke/g, 'Gà'],
  [/Lazac/g, 'Cá hồi'],
  [/Tonhal/g, 'Cá ngừ'],
  [/Uborka/g, 'Dưa chuột'],
  [/Avokádó/g, 'Bơ'],
  [/Angolna/g, 'Lươn'],
  [/Sertés/g, 'Heo'],
  [/Mangó/g, 'Xoài'],
  [/Tofu/g, 'Đậu phụ'],
]

const NAME_OVERRIDES = {
  10: {
    nameHU: 'Rák tempura',
    nameEN: 'Tempura shrimp',
    nameVI: 'Tôm tempura',
    descHU: 'Perzselt lazaccal, teriyaki szósz, rák kaviár',
    descEN: 'Seared salmon, teriyaki sauce, shrimp caviar',
    descVI: 'Cá hồi áp chảo, sốt teriyaki, trứng tôm',
    portion: '5 db',
  },
  13: {
    nameHU: 'Tom yum',
    nameEN: 'Tom yum',
    nameVI: 'Tom yum',
    descHU: 'Garnélarák, tintahal, kókusztej, citromfű...',
    descEN: 'Shrimp, squid, coconut milk, lemongrass...',
    descVI: 'Tôm, mực, sữa dừa, sả...',
  },
  15: {
    nameHU: 'Tojásleves',
    nameEN: 'Egg drop soup',
    nameVI: 'Súp trứng',
  },
  P2: { nameHU: 'Bun nem', nameEN: 'Bun nem', nameVI: 'Bún nem' },
  P3: { nameHU: 'Bun Bo Nam Bo', nameEN: 'Bun Bo Nam Bo', nameVI: 'Bún bò Nam Bộ' },
  P4: { nameHU: 'Bun cha', nameEN: 'Bun cha', nameVI: 'Bún chả' },
  P5: { nameHU: 'Bun Bo Hue', nameEN: 'Bun Bo Hue', nameVI: 'Bún bò Huế' },
  P7: { nameHU: 'Kyodon', nameEN: 'Gyudon', nameVI: 'Cơm bò Gyudon' },
  I9: { nameHU: 'California', nameEN: 'California roll', nameVI: 'California roll' },
  I12: { nameHU: 'Sesame roll 1', nameEN: 'Sesame roll 1', nameVI: 'Roll mè 1' },
  I13: { nameHU: 'Sesame roll 2 (Vega)', nameEN: 'Sesame roll 2 (Veggie)', nameVI: 'Roll mè 2 (chay)' },
  I16: { nameHU: 'Cheechee ROLL', nameEN: 'Cheechee roll', nameVI: 'Cheechee roll' },
  I17: { nameHU: 'Nagoya ROLL', nameEN: 'Nagoya roll', nameVI: 'Nagoya roll' },
  I18: { nameHU: 'Takoya ROLL', nameEN: 'Takoya roll', nameVI: 'Takoya roll' },
  I19: { nameHU: 'RUBY Rainbow ROLL', nameEN: 'RUBY Rainbow roll', nameVI: 'RUBY Rainbow roll' },
  I20: { nameHU: 'Noshiro ROLL', nameEN: 'Noshiro roll', nameVI: 'Noshiro roll' },
  I21: { nameHU: 'Towada ROLL', nameEN: 'Towada roll', nameVI: 'Towada roll' },
  I22: { nameHU: 'Kami ROLL', nameEN: 'Kami roll', nameVI: 'Kami roll' },
  I23: { nameHU: 'Miyako ROLL', nameEN: 'Miyako roll', nameVI: 'Miyako roll' },
  I24: { nameHU: 'Furano ROLL', nameEN: 'Furano roll', nameVI: 'Furano roll' },
  I25: { nameHU: 'Okaka ROLL', nameEN: 'Okaka roll', nameVI: 'Okaka roll' },
  I7: { nameHU: 'Caviar roll 1', nameEN: 'Caviar roll 1', nameVI: 'Caviar roll 1' },
  I8: { nameHU: 'Caviar roll 2', nameEN: 'Caviar roll 2', nameVI: 'Caviar roll 2' },
}

const SUSHI_SET_NAMES = {
  S1: {
    hu: 'Maki set (4 Lazac, 4 Tonhal, 4 Surimi, 4 Avokádó, 4 Uborka, 4 Rák)',
    en: 'Maki set (4 salmon, 4 tuna, 4 surimi, 4 avocado, 4 cucumber, 4 shrimp)',
    vi: 'Set maki (4 cá hồi, 4 cá ngừ, 4 surimi, 4 bơ, 4 dưa chuột, 4 tôm)',
  },
  S2: {
    hu: 'Maki nigiri set (4 Lazac, 4 Tonhal, 8 Uborka, 2 Lazac Nigiri)',
    en: 'Maki nigiri set (4 salmon, 4 tuna, 8 cucumber, 2 salmon nigiri)',
    vi: 'Set maki nigiri (4 cá hồi, 4 cá ngừ, 8 dưa chuột, 2 nigiri cá hồi)',
  },
  S3: {
    hu: 'Sake set (4 Lazac Kifordított, 4 Tonhal Kifordított, 1 Lazac Nigiri, 1 Tonhal Nigiri, 4 Lazac Maki, 4 Tonhal Maki)',
    en: 'Sake set (4 salmon inside-out, 4 tuna inside-out, 1 salmon nigiri, 1 tuna nigiri, 4 salmon maki, 4 tuna maki)',
    vi: 'Set sake (4 uramaki cá hồi, 4 uramaki cá ngừ, 1 nigiri cá hồi, 1 nigiri cá ngừ, 4 maki cá hồi, 4 maki cá ngừ)',
  },
  S4: {
    hu: 'Fire set (4 Avokádó Maki, 4 Uborka Maki, 6 Sült Lazac Maki, 2 Lazac Nigiri)',
    en: 'Fire set (4 avocado maki, 4 cucumber maki, 6 fried salmon maki, 2 salmon nigiri)',
    vi: 'Set Fire (4 maki bơ, 4 maki dưa chuột, 6 maki cá hồi chiên, 2 nigiri cá hồi)',
  },
  S5: {
    hu: 'Vega set (4 Avokádó Maki, 4 Uborka Maki, 8 Inside Out Vega, 2 Avokádó Nigiri)',
    en: 'Veggie set (4 avocado maki, 4 cucumber maki, 8 veggie inside-out, 2 avocado nigiri)',
    vi: 'Set chay (4 maki bơ, 4 maki dưa chuột, 8 uramaki chay, 2 nigiri bơ)',
  },
  S6: {
    hu: 'Sushi imádó (4 Surimi Maki, 4 Tempura Maki, 4 Lazac Inside Out, 4 Kaviár Inside Out, 2 Lazac Nigiri)',
    en: 'Sushi lover set (4 surimi maki, 4 tempura maki, 4 salmon inside-out, 4 caviar inside-out, 2 salmon nigiri)',
    vi: 'Set người mê sushi (4 maki surimi, 4 maki tempura, 4 uramaki cá hồi, 4 uramaki trứng cá, 2 nigiri cá hồi)',
  },
  S7: {
    hu: 'I.O. set (4 California I.O, 4 Surimi I.O, 8 Lazac Maki, 8 Uborka Maki, 2 Tonhal Nigiri)',
    en: 'Inside-out set (4 California I.O., 4 surimi I.O., 8 salmon maki, 8 cucumber maki, 2 tuna nigiri)',
    vi: 'Set uramaki (4 California I.O., 4 surimi I.O., 8 maki cá hồi, 8 maki dưa chuột, 2 nigiri cá ngừ)',
  },
  S8: {
    hu: 'Crunchy set (6 Sült Lazac Maki, 6 Sült Vega Maki, 6 Nigiri: 2 Lazac, 2 Tonhal, 2 Rák)',
    en: 'Crunchy set (6 fried salmon maki, 6 fried veggie maki, 6 nigiri: 2 salmon, 2 tuna, 2 shrimp)',
    vi: 'Set giòn (6 maki cá hồi chiên, 6 maki chay chiên, 6 nigiri: 2 cá hồi, 2 cá ngừ, 2 tôm)',
  },
  S9: {
    hu: 'Happy set (10 Nigiri, 8 Tempura, 8 Uborka, 8 Mangó)',
    en: 'Happy set (10 nigiri, 8 tempura, 8 cucumber, 8 mango)',
    vi: 'Set Happy (10 nigiri, 8 tempura, 8 dưa chuột, 8 xoài)',
  },
  S10: {
    hu: 'Ruby set (6 Sült Csirke Maki, 6 Sült Lazac Maki, 6 Nigiri, 8 Avokádó Kifordított Maki, 4 Lazac Kifordított, 4 Tonhal Kifordított, 8 Lazac Maki, 8 Uborka Maki, 8 Avokádó Maki, 8 Surimi Maki)',
    en: 'Ruby set (6 fried chicken maki, 6 fried salmon maki, 6 nigiri, 8 avocado inside-out maki, 4 salmon inside-out, 4 tuna inside-out, 8 salmon maki, 8 cucumber maki, 8 avocado maki, 8 surimi maki)',
    vi: 'Set Ruby (6 maki gà chiên, 6 maki cá hồi chiên, 6 nigiri, 8 uramaki bơ, 4 uramaki cá hồi, 4 uramaki cá ngừ, 8 maki cá hồi, 8 maki dưa chuột, 8 maki bơ, 8 maki surimi)',
  },
  S11: {
    hu: 'Ruby set 2 (12 sült lazac futomaki, 8 lazac sashimi, 4 tonhal sashimi, 4 rák sashimi, 24 uramaki, 8 nigiri, 24 maki, 8 omlett)',
    en: 'Ruby set 2 (12 fried salmon futomaki, 8 salmon sashimi, 4 tuna sashimi, 4 shrimp sashimi, 24 uramaki, 8 nigiri, 24 maki, 8 omelette)',
    vi: 'Set Ruby 2 (12 futomaki cá hồi chiên, 8 sashimi cá hồi, 4 sashimi cá ngừ, 4 sashimi tôm, 24 uramaki, 8 nigiri, 24 maki, 8 trứng cuộn)',
  },
  S12: {
    hu: 'Ruby party set (30 nigiri, 16 lazac sashimi, 12 sült futomaki, 24 uramaki, 18 maki)',
    en: 'Ruby party set (30 nigiri, 16 salmon sashimi, 12 fried futomaki, 24 uramaki, 18 maki)',
    vi: 'Set Ruby party (30 nigiri, 16 sashimi cá hồi, 12 futomaki chiên, 24 uramaki, 18 maki)',
  },
}

function applyPairs(text, pairs) {
  let out = String(text || '')
  for (const [from, to] of pairs) out = out.replace(from, to)
  return out.replace(/\s+/g, ' ').trim()
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  result.push(current.trim())
  return result
}

function parseMenuTxt(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((line) => line.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < 5) {
      throw new Error(`Line ${i + 1} has ${cols.length} columns: ${lines[i]}`)
    }
    rows.push({
      categorySource: cols[0],
      sku: cols[1],
      nameRaw: cols[2],
      allergenRaw: cols[3],
      priceRaw: cols[4],
    })
  }
  return rows
}

const TOPPING_ONLY = /^(salmon|tuna|shrimp|chicken|beef|pork|tofu|seafood|surimi|avocado|cucumber|mango|eel|fried chicken|fried duck|tempura shrimp|tempura salmon|smoked salmon|smoked tuna|red tuna|tiger shrimp|spicy salmon|spicy tuna|spicy surimi|masago caviar|salmon caviar|vegetarian|vegetables & tofu|wakame)$/i

function withTranslatedPrefix(hu, other, pairs) {
  if (!other) return other
  const colon = hu.indexOf(':')
  if (colon === -1 || /:/.test(other) || !TOPPING_ONLY.test(other.trim())) return other
  const translatedPrefix = applyPairs(hu.slice(0, colon).trim(), pairs)
  return `${translatedPrefix}: ${other.trim()}`
}

const PORTION_INNER = /^(?:\d+\s*(?:db|pcs|cái)|kicsi|nagy|small|large)$/i

function normalizePortionToken(value) {
  const match = String(value).trim().match(/^(\d+)\s*(db|pcs|cái)$/i)
  if (match) return `${match[1]} ${match[2].toLowerCase()}`
  return String(value).trim()
}

function isDescriptionParen(value) {
  return /[,]/.test(value) || value.split(/\s+/).length >= 3 || value.length > 24
}

function peelExtras(text) {
  const portions = []
  const descs = []
  const name = String(text || '')
    .replace(/\s*\(([^)]*)\)\s*/g, (full, inner) => {
      const value = String(inner || '').trim()
      if (!value) return ' '
      if (PORTION_INNER.test(value)) {
        portions.push(normalizePortionToken(value))
        return ' '
      }
      if (isDescriptionParen(value)) {
        descs.push(value)
        return ' '
      }
      return full
    })
    .replace(/\s+/g, ' ')
    .trim()

  return {
    name,
    portion: [...new Set(portions)].join(' / '),
    description: descs.join('; '),
  }
}

function mergeParts(...parts) {
  return [...new Set(
    parts
      .filter(Boolean)
      .flatMap((part) => String(part).split(' / ').map((item) => item.trim()).filter(Boolean))
  )].join(' / ')
}

function parseProductCopy(nameRaw, sku) {
  const override = NAME_OVERRIDES[sku]
  if (override) {
    return {
      nameHU: override.nameHU || '',
      nameEN: override.nameEN || '',
      nameVI: override.nameVI || '',
      descriptionHU: override.descHU || '',
      descriptionEN: override.descEN || '',
      descriptionVI: override.descVI || '',
      portion: override.portion || '',
    }
  }

  const parts = String(nameRaw).split(' / ').map((item) => item.trim()).filter(Boolean)
  let huRaw = nameRaw
  let enRaw = ''
  let viRaw = ''

  if (parts.length >= 2) {
    huRaw = parts[0]
    const right = parts.slice(1).join(' / ')
    if (HAS_VI.test(right) && !HAS_VI.test(huRaw)) viRaw = right
    else enRaw = right
  }

  const huPeeled = peelExtras(huRaw)
  const enBase = enRaw || applyPairs(huPeeled.name, HU_TO_EN)
  const enPeeled = peelExtras(enBase)
  const viPeeled = viRaw ? peelExtras(viRaw) : null

  const nameHU = huPeeled.name
  const nameEN = withTranslatedPrefix(nameHU, enPeeled.name, HU_TO_EN)
  let nameVI = viPeeled?.name || applyPairs(nameEN, EN_TO_VI)
  if (!nameVI || nameVI === nameEN) nameVI = applyPairs(nameHU, HU_TO_VI)

  const descriptionHU = huPeeled.description
  const descriptionEN = enPeeled.description || (descriptionHU ? applyPairs(descriptionHU, HU_TO_EN) : '')
  const descriptionVI = viPeeled?.description
    || (descriptionEN ? applyPairs(descriptionEN, EN_TO_VI) : '')
    || (descriptionHU ? applyPairs(descriptionHU, HU_TO_VI) : '')

  return {
    nameHU,
    nameEN,
    nameVI,
    descriptionHU,
    descriptionEN,
    descriptionVI,
    portion: mergeParts(huPeeled.portion, enPeeled.portion, viPeeled?.portion),
  }
}

function uniqueSku(sku, categorySource) {
  if (categorySource === 'Sushi Set' && /^S\d+$/i.test(sku)) return `SET-${sku}`
  return sku
}

function slugFromSku(sku) {
  return String(sku)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parsePrices(priceRaw) {
  return (String(priceRaw).match(/\d+/g) || [])
    .map(Number)
    .filter((n) => n > 0)
}

function sizeVariants(sku, categorySource, prices) {
  if (prices.length < 2) return null
  if (categorySource === 'Phở - Ramen - Udon' && /^20[A-F]$/i.test(sku)) {
    return [
      { suffix: 'K', price: prices[0], portion: 'kicsi / small / tô nhỏ' },
      { suffix: 'N', price: prices[1], portion: 'nagy / large / tô lớn' },
    ]
  }
  if (categorySource === 'Sushi Các Loại' && /^F[123]$/i.test(sku)) {
    return [
      { suffix: '4', price: prices[0], portion: '4 db / 4 pcs' },
      { suffix: '8', price: prices[1], portion: '8 db / 8 pcs' },
    ]
  }
  return [
    { suffix: 'K', price: prices[0], portion: 'kicsi / small / tô nhỏ' },
    { suffix: 'N', price: prices[1], portion: 'nagy / large / tô lớn' },
  ]
}

function toFoodFields(copy, extra = {}) {
  return {
    name: copy.nameHU,
    nameHU: copy.nameHU,
    nameEN: copy.nameEN,
    nameVI: copy.nameVI,
    description: copy.descriptionHU || '',
    descriptionHU: copy.descriptionHU || '',
    descriptionEN: copy.descriptionEN || '',
    descriptionVI: copy.descriptionVI || '',
    portion: extra.portion || copy.portion || '',
    ...extra,
  }
}

function expandRow(row) {
  const copy = parseProductCopy(row.nameRaw, row.sku)
  const allergens = mapAllergenCodes(
    String(row.allergenRaw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
  const prices = parsePrices(row.priceRaw)
  const baseSku = uniqueSku(row.sku, row.categorySource)
  const sizes = sizeVariants(row.sku, row.categorySource, prices)
  const shared = { allergens, categorySource: row.categorySource, options: [] }

  if (sizes) {
    return sizes.map((size) => toFoodFields(copy, {
      sku: `${baseSku}-${size.suffix}`,
      slug: slugFromSku(`${baseSku}-${size.suffix}`),
      price: size.price,
      portion: size.portion,
      ...shared,
    }))
  }

  if (!prices.length) {
    throw new Error(`No price for SKU ${row.sku}: ${row.priceRaw}`)
  }

  return [toFoodFields(copy, {
    sku: baseSku,
    slug: slugFromSku(baseSku),
    price: prices[0],
    ...shared,
  })]
}

async function upsertCategory(def) {
  const existing = await categoryModel.findOne({
    $or: [
      { name: def.nameHU, language: 'hu' },
      { name: def.nameEN, language: 'en' },
      { name: def.nameVI, language: 'vi' },
      { name: def.source },
    ],
  })

  if (existing) {
    return { doc: existing, created: false }
  }

  const doc = await categoryModel.create({
    name: def.nameHU,
    description: `${def.nameEN} / ${def.nameVI}`,
    image: '',
    sortOrder: def.sortOrder,
    language: 'hu',
    isActive: true,
  })
  return { doc, created: true }
}

async function importMenu() {
  if (!fs.existsSync(MENU_PATH)) {
    console.error(`Menu file not found: ${MENU_PATH}`)
    process.exit(1)
  }

  const rows = parseMenuTxt(MENU_PATH)
  const foods = rows.flatMap(expandRow)

  const skuCounts = foods.reduce((acc, food) => {
    acc[food.sku] = (acc[food.sku] || 0) + 1
    return acc
  }, {})
  const duplicateSkus = Object.entries(skuCounts).filter(([, count]) => count > 1)
  if (duplicateSkus.length) {
    throw new Error(`Duplicate SKUs in import: ${duplicateSkus.map(([sku]) => sku).join(', ')}`)
  }

  const unknownCats = [...new Set(rows.map((r) => r.categorySource))]
    .filter((name) => !CATEGORIES.some((c) => c.source === name))
  if (unknownCats.length) {
    throw new Error(`Unknown categories: ${unknownCats.join(', ')}`)
  }

  console.log(`Parsed ${rows.length} menu rows → ${foods.length} products`)
  console.log(`Dual-price splits: ${foods.length - rows.length}`)
  if (DRY_RUN) {
    console.log('\nDRY RUN sample / dual-price items:')
    foods
      .filter((f) => /-(K|N|4|8)$/.test(f.sku) || f.sku.startsWith('SET-') || ['01', '15', 'S1', '20A-K'].includes(f.sku))
      .forEach((f) => {
        console.log(`  ${f.sku.padEnd(10)} ${f.price} Ft  nameHU:${f.nameHU} | nameEN:${f.nameEN} | nameVI:${f.nameVI}`)
        if (f.descriptionHU || f.descriptionEN || f.descriptionVI) {
          console.log(`             descHU:${f.descriptionHU || '-'} | descEN:${f.descriptionEN || '-'} | descVI:${f.descriptionVI || '-'}`)
        }
        if (f.portion) console.log(`             portion:${f.portion}`)
      })
    console.log('\nNo database writes.')
    return
  }

  const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DBNAME
  await mongoose.connect(mongoUrl.replace(/[?&]appName=[^&]*/g, '').replace(/[?&]$/, ''), {
    ...(dbName ? { dbName } : {}),
  })
  console.log('Connected to MongoDB', dbName || '')

  if (WIPE) {
    const foodDel = await foodModel.deleteMany({})
    const catDel = await categoryModel.deleteMany({})
    console.log(`Wiped ${foodDel.deletedCount} foods, ${catDel.deletedCount} categories`)
  }

  const categoryIdBySource = {}
  let createdCats = 0
  for (const def of CATEGORIES) {
    const { doc, created } = await upsertCategory(def)
    categoryIdBySource[def.source] = doc._id.toString()
    createdCats += created ? 1 : 0
    console.log(`  ${created ? 'CREATED' : 'REUSED '} ${def.nameHU} (${def.source})`)
  }

  let upserted = 0
  for (const food of foods) {
    const doc = {
      sku: food.sku,
      slug: food.slug,
      name: food.name,
      nameHU: food.nameHU,
      nameEN: food.nameEN,
      nameVI: food.nameVI,
      description: food.descriptionHU || '',
      descriptionHU: food.descriptionHU || '',
      descriptionEN: food.descriptionEN || '',
      descriptionVI: food.descriptionVI || '',
      price: food.price,
      image: '',
      category: categoryIdBySource[food.categorySource],
      quantity: 999,
      status: 'active',
      portion: food.portion || '',
      allergens: food.allergens,
      options: [],
      isPromotion: false,
      disableBoxFee: false,
      isRecommended: false,
      recommendPriority: 999,
    }
    await foodModel.findOneAndUpdate(
      { sku: food.sku },
      { $set: doc },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    )
    upserted += 1
  }

  console.log('\nIMPORT SUMMARY')
  console.log(`Categories created: ${createdCats} / ${CATEGORIES.length}`)
  console.log(`Products upserted:  ${upserted}`)
}

importMenu()
  .catch((err) => {
    console.error('Import failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
  })
