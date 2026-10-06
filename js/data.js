"use strict";

/* ==================== DONNEES ==================== */

const NUTRI = {
  proteines:  "Protéines",
  fer:        "Fer",
  b12:        "B12",
  calcium:    "Calcium",
  omega3:     "Oméga-3",
  fibres:     "Fibres",
  vitamineC:  "Vitamine C"
};

// Delai de re-proposition (en jours) selon la note.
const DELAYS = { 0: 45, 1: 14, 2: 5 };

const BASE_MEALS = [
  {
    id: "tomateMozza",
    nom: "Tomate-mozza + pain grillé",
    temps: 5,
    tags: ["calcium", "proteines", "vitamineC"],
    ing: [["Tomates", "2"], ["Mozzarella", "1 boule"], ["Pain complet", "2 tranches"], ["Huile d'olive", "un filet"], ["Basilic (option)", "quelques feuilles"]],
    etapes: "Trancher les tomates et la mozzarella, arroser d'huile, saler, poivrer. Griller le pain."
  },
  {
    id: "taboulePoisChiches",
    nom: "Taboulé tout prêt + pois chiches + feta",
    temps: 5,
    tags: ["proteines", "fer", "fibres", "calcium"],
    ing: [["Taboulé tout prêt", "1 barquette"], ["Pois chiches (boîte)", "1/2 boîte"], ["Feta", "60 g"]],
    etapes: "Verser le taboulé dans une assiette, ajouter les pois chiches égouttés, émietter la feta."
  },
  {
    id: "melangeBerbere",
    nom: "Mélange berbère + œuf dur + pain",
    temps: 10,
    tags: ["proteines", "b12", "fibres"],
    ing: [["Mélange berbère (salade prête)", "1 barquette"], ["Œufs", "1"], ["Pain", "2 tranches"]],
    etapes: "Cuire l'œuf 8 min dans l'eau bouillante (ou prendre un œuf dur déjà cuit). Servir avec la salade et le pain."
  },
  {
    id: "patesFromageBrocoli",
    nom: "Pâtes fromage-brocoli",
    temps: 12,
    tags: ["proteines", "calcium", "fibres", "vitamineC"],
    ing: [["Pâtes", "100 g"], ["Brocoli (surgelé)", "150 g"], ["Crème", "2 c. à s."], ["Fromage râpé", "40 g"]],
    etapes: "Cuire les pâtes, ajouter le brocoli surgelé 4 min avant la fin. Égoutter, mélanger avec la crème et le fromage."
  },
  {
    id: "carbonaraVeg",
    nom: "Pâtes carbonara végétale",
    temps: 12,
    tags: ["proteines", "calcium", "b12"],
    ing: [["Pâtes", "100 g"], ["Jambon végétal", "3 tranches"], ["Crème", "2 c. à s."], ["Fromage râpé", "30 g"]],
    etapes: "Cuire les pâtes. Couper le jambon végétal en lanières, le faire dorer 2 min. Mélanger le tout avec la crème et le fromage, poivrer."
  },
  {
    id: "steakRizHaricots",
    nom: "Steak végétal + riz + haricots verts",
    temps: 12,
    tags: ["proteines", "fer", "fibres"],
    ing: [["Steak végétal", "1"], ["Riz (sachet micro-ondes)", "1"], ["Haricots verts (surgelés)", "150 g"]],
    etapes: "Faire chauffer le riz au micro-ondes. Cuire les haricots verts à la poêle avec un peu d'eau, cuire le steak végétal selon le paquet."
  },
  {
    id: "burgerVeg",
    nom: "Burger végétal",
    temps: 12,
    tags: ["proteines", "calcium"],
    ing: [["Pain à burger", "1"], ["Steak végétal", "1"], ["Cheddar (tranches)", "1"], ["Tomate", "1/2"], ["Salade", "2 feuilles"]],
    etapes: "Cuire le steak végétal à la poêle, fondre le cheddar dessus. Toaster le pain, assembler."
  },
  {
    id: "sandwichVeg",
    nom: "Sandwich jambon-fromage végétal",
    temps: 5,
    tags: ["proteines", "calcium", "b12"],
    ing: [["Pain de mie complet", "2 tranches"], ["Jambon végétal", "2 tranches"], ["Fromage", "2 tranches"], ["Tomate", "1/2"]],
    etapes: "Beurrer le pain si envie, empiler jambon végétal, fromage et tomate. Déguster tel quel ou grillé."
  },
  {
    id: "rizFetaNoix",
    nom: "Salade de riz, feta et noix",
    temps: 15,
    tags: ["proteines", "calcium", "omega3", "fibres"],
    ing: [["Riz (sachet micro-ondes)", "1"], ["Maïs (boîte)", "1/2 boîte"], ["Feta", "60 g"], ["Noix", "une poignée"]],
    etapes: "Chauffer le riz, laisser tiédir 2 min, mélanger avec le maïs, la feta émiettée et les noix."
  },
  {
    id: "omelette",
    nom: "Omelette au fromage + tomate",
    temps: 10,
    tags: ["proteines", "b12", "calcium", "vitamineC"],
    ing: [["Œufs", "3"], ["Fromage râpé", "30 g"], ["Pain", "2 tranches"], ["Tomate", "1"]],
    etapes: "Battre les œufs, verser dans une poêle chaude, ajouter le fromage, replier. Servir avec le pain et la tomate."
  },
  {
    id: "couscousPoisChiches",
    nom: "Couscous express pois chiches",
    temps: 10,
    tags: ["proteines", "fer", "fibres", "vitamineC"],
    ing: [["Semoule précuite", "80 g"], ["Pois chiches (boîte)", "1/2 boîte"], ["Tomate", "1"], ["Huile d'olive", "1 c. à s."]],
    etapes: "Verser de l'eau bouillante sur la semoule (même volume), attendre 4 min. Ajouter les pois chiches, la tomate en dés, l'huile, le cumin."
  },
  {
    id: "dahlLentilles",
    nom: "Dahl de lentilles corail (one-pot)",
    temps: 25,
    tags: ["proteines", "fer", "fibres"],
    ing: [["Lentilles corail", "100 g"], ["Lait de coco (brique)", "1 petit"], ["Curry (poudre)", "1 c. à c."], ["Riz (sachet micro-ondes)", "1"]],
    etapes: "Rincer les lentilles. Les cuire 15 min avec le lait de coco, le curry et un peu d'eau. Servir avec le riz. Astuce : cuisine le double, ça se garde 3 jours au frigo."
  },
  {
    id: "houmousPita",
    nom: "Houmous, crudités et pain pita",
    temps: 5,
    tags: ["fer", "fibres", "vitamineC"],
    ing: [["Houmous tout prêt", "1 pot"], ["Pain pita", "1"], ["Carotte", "1"], ["Concombre", "1/4"]],
    etapes: "Couper les crudités en bâtons, réchauffer la pita. Tremper. Zéro cuisson."
  },
  {
    id: "soupeFromage",
    nom: "Soupe toute prête + tartines fromage",
    temps: 8,
    tags: ["calcium", "fibres", "vitamineC"],
    ing: [["Soupe (brique)", "500 ml"], ["Pain complet", "2 tranches"], ["Fromage", "2 portions"]],
    etapes: "Chauffer la soupe 4 min. Griller les tartines avec le fromage fondu dessus."
  },
  {
    id: "pizzaExpress",
    nom: "Pizza express (pâte toute prête)",
    temps: 15,
    tags: ["calcium", "proteines", "vitamineC"],
    ing: [["Pâte à pizza toute prête", "1"], ["Sauce tomate", "3 c. à s."], ["Mozzarella", "1 boule"], ["Olives (option)", "quelques-unes"]],
    etapes: "Étaler la pâte, napper de sauce tomate, ajouter la mozzarella en rondelles. Four 220°C, 10-12 min."
  },
  {
    id: "saladeQuinoa",
    nom: "Salade quinoa, feta, noix",
    temps: 8,
    tags: ["proteines", "calcium", "omega3", "vitamineC", "fibres"],
    ing: [["Quinoa cuit (sachet)", "1"], ["Feta", "60 g"], ["Noix", "une poignée"], ["Tomates cerises", "6"], ["Concombre", "1/4"]],
    etapes: "Tout mélanger dans un saladier avec un filet d'huile d'olive."
  },
  {
    id: "patesPesto",
    nom: "Pâtes au pesto + tomates cerises",
    temps: 10,
    tags: ["proteines", "calcium", "vitamineC"],
    ing: [["Pâtes", "100 g"], ["Pesto (pot)", "2 c. à s."], ["Tomates cerises", "8"], ["Parmesan", "quelques copeaux"]],
    etapes: "Cuire les pâtes, réserver une louche d'eau de cuisson, mélanger avec le pesto et l'eau. Ajouter les tomates cerises coupées en deux."
  },
  {
    id: "chiliVegExpress",
    nom: "Chili végétal express",
    temps: 15,
    tags: ["proteines", "fer", "fibres", "vitamineC"],
    ing: [["Haricots rouges (boîte)", "1 boîte"], ["Maïs (boîte)", "1/2 boîte"], ["Tomates concassées (boîte)", "1/2 boîte"], ["Riz (sachet micro-ondes)", "1"], ["Épices chili", "1 c. à c."]],
    etapes: "Faire revenir les tomates concassées avec les épices 5 min, ajouter haricots rincés et maïs, laisser 5 min. Servir sur le riz."
  }
];

const RATES = ["Pas ouf", "Ok", "J'aime"];
const RATE_CLASS = ["badd", "mid", "good"];

