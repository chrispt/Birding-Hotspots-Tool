import { assert } from '../run-tests.js';
import { validateCoordinates } from '../../js/utils/validators.js';

export async function testValidateCoordinatesRejectsMalformedNumericStrings() {
    const result = validateCoordinates('40oops', '-73oops');

    assert(result.valid === false, 'Malformed coordinate strings must be rejected');
}
