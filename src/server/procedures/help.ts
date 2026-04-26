import { router, publicProcedure } from '../trpc.ts'
import { DescribeInputSchema } from '../../shared/schemas.ts'
import type { TFiretoolResult } from '../../shared/types.ts'
import { buildGeneralHelp, buildServiceHelp } from '../../help/catalog.ts'

export const helpRouter = router({
  describe: publicProcedure
    .input(DescribeInputSchema)
    .query(({ input }): TFiretoolResult => {
      if (input.service) {
        return {
          ok: true,
          operation: 'help.describe',
          warnings: [],
          result: buildServiceHelp(input.service),
        }
      }

      return {
        ok: true,
        operation: 'help.describe',
        warnings: [],
        result: buildGeneralHelp(),
      }
    }),
})
