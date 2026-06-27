function durationWeightedRating(reviews = []) {
    if (!reviews || reviews.length === 0) return null;
    let ws = 0, tw = 0;
    reviews.forEach(r => {
        const w = Math.sqrt(r.duration_months || 1);
        ws += (r.rating || 5) * w;
        tw += w;
    });
    return tw > 0 ? parseFloat((ws/tw).toFixed(2)) : null;
}

function getReviewStats(reviews = []) {
    if (!reviews || reviews.length === 0) return { count:0, weighted_avg:null, simple_avg:null };
    const ratings = reviews.map(r => r.rating || 0);
    return {
        count: reviews.length,
        weighted_avg: durationWeightedRating(reviews),
        simple_avg: parseFloat((ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(2)),
        min: Math.min(...ratings), max: Math.max(...ratings),
    };
}

module.exports = { durationWeightedRating, getReviewStats };
