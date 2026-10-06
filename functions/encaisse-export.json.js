/* Encaisse — garde anti-fuite (correctif critique n°1).
   L'export JSON local (données réelles, git-ignoré) ne doit JAMAIS être servi
   en ligne. `wrangler pages deploy .` uploade tout le dossier, donc ce garde-fou
   renvoie 404 même si le fichier est déployé par accident.
   La Function a priorité sur le fichier statique pour cette route exacte.
   Règle d'or restante : déplacer/supprimer encaisse-export.json avant deploy. */
export async function onRequest() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });
}
