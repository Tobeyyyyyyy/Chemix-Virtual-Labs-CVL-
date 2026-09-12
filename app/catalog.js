(function () {
  const assetRoot = 'CVLproperty/assets/chemIcons/';
  const propertyAssets = window.CVLPropertyAssets || {};
  const categories = {
    reactor: [
      ['4e98bbf5.png', 'Beaker (100 mL)'],
      ['9cbea716.png', 'Round-bottom flask'],
      ['9f348efa.png', 'Separatory funnel'],
      ['227eb8eb.png', 'Erlenmeyer flask'],
      ['504c9a8d.png', 'Test tube'],
      ['581f8fdb.png', 'Gas bottle'],
      ['583f57a6.png', 'Dropper bottle'],
      ['662e2a8e.png', 'Conical flask'],
      ['668e32af.png', 'Measuring cylinder'],
      ['4014a4a9.png', 'Evaporating dish'],
      ['14647a4b.png', 'Reagent bottle'],
      ['a8f59785.png', 'Small test tube'],
      ['b3fd337a.png', 'Spirit lamp'],
      ['c4db6b11.png', 'Tripod stand'],
      ['cbf6475c.png', 'Glass rod'],
      ['f8ff4f0b.png', 'Burette']
    ],
    aid: [
      ['03b600dc.png', 'Tripod stand'],
      ['03fb0d8d.png', 'Wire gauze'],
      ['047f4ac5.png', 'Iron stand'],
      ['04f184c1.png', 'Test tube rack'],
      ['05c45a8e.png', 'Rubber stopper'],
      ['073a0697.png', 'Clamp'],
      ['078389eb.png', 'Thermometer'],
      ['0a1319a0.png', 'Alcohol lamp'],
      ['0a5407df.png', 'Glass tube'],
      ['0c71830f.png', 'Rubber tube']
    ],
    solid: [
      ['013e8bc0.png', 'Copper sulfate'],
      ['014d2124.png', 'Sodium chloride'],
      ['03c7053f.png', 'Iron powder'],
      ['055f8dde.png', 'Sulfur'],
      ['071e21a8.png', 'Calcium carbonate'],
      ['07438a79.png', 'Potassium permanganate'],
      ['07915045.png', 'Magnesium ribbon'],
      ['0cefcda5.png', 'Zinc granules']
    ],
    liquid: [
      ['077433ea.png', 'Hydrochloric acid'],
      ['082829c6.png', 'Sodium hydroxide solution'],
      ['0babefb6.png', 'Copper sulfate solution'],
      ['0c3083d4.png', 'Distilled water'],
      ['0cb6ce84.png', 'Ethanol'],
      ['148b2e3e.png', 'Bromine water'],
      ['1b97dd36.png', 'Iodine solution'],
      ['1c238b82.png', 'Universal indicator']
    ],
    gas: [
      ['04808422.png', 'Hydrogen'],
      ['0f681129.png', 'Oxygen'],
      ['2e378115.png', 'Carbon dioxide'],
      ['3aa0af3e.png', 'Chlorine'],
      ['423f0981.png', 'Ammonia'],
      ['42a237ed.png', 'Nitrogen'],
      ['5efee688.png', 'Sulfur dioxide'],
      ['60be6ca3.png', 'Methane']
    ]
  };

  const categoryLabels = {
    reactor: 'Reaction vessels',
    aid: 'Assistive devices',
    solid: 'Solid chemicals',
    liquid: 'Liquid chemicals',
    gas: 'Gas chemicals'
  };

  Object.keys(propertyAssets).forEach((category) => {
    propertyAssets[category].forEach((item) => {
      if (!categories[category].some((existing) => existing[0] === item[0])) {
        categories[category].push(item);
      }
    });
  });

  async function discoverAssets(onUpdated) {
    await Promise.all(
      Object.keys(categories).map(async (category) => {
        try {
          const response = await fetch(assetRoot + category + '/');
          if (!response.ok) return;

          const listing = await response.text();
          const files = [...listing.matchAll(/href=["']([^"']+\.png)["']/gi)]
            .map((match) => decodeURIComponent(match[1].replace(/^\.?\//, '')));

          files.forEach((file) => {
            if (!categories[category].some((item) => item[0] === file)) {
              categories[category].push([
                file,
                category + ' asset ' + file.replace(/\.png$/i, '')
              ]);
            }
          });
        } catch (error) {
          console.warn('CVL could not discover ' + category + ' assets.', error);
        }
      })
    );

    if (onUpdated) onUpdated();
  }

  window.CVL = {
    assetRoot,
    categories,
    categoryLabels,
    discoverAssets
  };
}());
