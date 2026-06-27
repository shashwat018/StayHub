// ── rocWeighting.js ───────────────────────────────────────────
function calculateROCWeights(priorities) {
    const n = priorities.length;
    const weights = {};
    priorities.forEach((criterion, rank) => {
        let w = 0;
        for (let j = rank; j < n; j++) w += 1/(j+1);
        w /= n;
        weights[criterion] = parseFloat(w.toFixed(4));
    });
    return weights;
}

function redistributeWeights(weights, zeroCriteria = []) {
    const active = {}, zeroSet = new Set(zeroCriteria);
    let stolen = 0, activeTotal = 0;
    for (const [k, v] of Object.entries(weights)) {
        if (zeroSet.has(k)) { stolen += v; }
        else { active[k] = v; activeTotal += v; }
    }
    const redistributed = {};
    for (const [k, v] of Object.entries(active)) {
        redistributed[k] = parseFloat((v + stolen*(v/activeTotal)).toFixed(4));
    }
    zeroCriteria.forEach(k => { redistributed[k] = 0; });
    return redistributed;
}

module.exports = { calculateROCWeights, redistributeWeights };
